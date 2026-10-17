// Shared deletion logic used by both server.mjs (website button) and
// delete-selected.mjs (command line).
//
// Each success is appended to deleted.json and removed from selected.json right
// away, so stopping or crashing mid-run loses nothing and a re-run resumes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Emusks from "emusks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SELECTED = path.join(__dirname, "selected.json");
export const DELETED = path.join(__dirname, "deleted.json");
const TWEETS = path.join(__dirname, "tweets.json");

const DELAY_MS = 1500;

export const readIds = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return []; } };

export function loadArchive() {
  const { tweets, replies, retweets } = JSON.parse(fs.readFileSync(TWEETS, "utf8"));
  return {
    byId: new Map([...tweets, ...replies, ...retweets].map((t) => [t.id, t])),
    replyIds: new Set(replies.map((t) => t.id)),
    rtIds: new Set(retweets.map((t) => t.id)),
  };
}

// The pending queue: ticked ids that haven't been deleted yet.
export function pendingIds() {
  const deleted = new Set(readIds(DELETED));
  return readIds(SELECTED).filter((id) => !deleted.has(id));
}

function markDeleted(id) {
  const deleted = new Set(readIds(DELETED));
  deleted.add(id);
  fs.writeFileSync(DELETED, JSON.stringify([...deleted]));
  // re-read selected.json so ticks made in the viewer during the run are kept
  fs.writeFileSync(SELECTED, JSON.stringify(readIds(SELECTED).filter((x) => !deleted.has(x))));
}

/**
 * Delete every pending id. `onEvent` receives progress events:
 *   {type:"start", total} {type:"ok", id, n} {type:"fail", id, n, msg}
 *   {type:"wait", seconds} {type:"done", ok, fail, stopped}
 * `shouldStop()` is polled between deletes (and during rate-limit waits).
 */
export async function runDeletion({ token, onEvent = () => {}, shouldStop = () => false }) {
  const { rtIds } = loadArchive();
  const queue = pendingIds();

  const client = new Emusks();
  await client.login(token); // throws on a bad token

  // sleep in 1s steps so a stop request takes effect quickly
  const sleep = async (ms) => {
    for (let left = ms; left > 0 && !shouldStop(); left -= 1000) {
      await new Promise((r) => setTimeout(r, Math.min(1000, left)));
    }
  };

  // emusks only throws when X returns errors with no data at all; a response that
  // carries both is passed through. Treat any reported error as a failure so a
  // delete never counts as done unless X said nothing went wrong.
  const strict = (res) => {
    if (res?.errors?.length) throw new Error(res.errors.map((e) => e.message).join(", "));
    return res;
  };
  const deleteTweet = async (id) => strict(await client.tweets.delete(id));

  // Retweets: the archive only has the retweet's own id. Try deleting that first;
  // if X refuses, look up the original tweet and undo the retweet on it instead.
  async function removeRetweet(id) {
    try {
      return await deleteTweet(id);
    } catch (err) {
      const t = await client.tweets.get(id);
      const src = t?.retweeting?.id;
      if (!src) throw err;
      return strict(await client.tweets.unretweet(src));
    }
  }

  onEvent({ type: "start", total: queue.length });
  let ok = 0, fail = 0;
  for (const [i, id] of queue.entries()) {
    if (shouldStop()) break;
    for (let attempt = 1; ; attempt++) {
      try {
        if (rtIds.has(id)) await removeRetweet(id);
        else await deleteTweet(id);
        markDeleted(id);
        ok++;
        onEvent({ type: "ok", id, n: i + 1 });
        break;
      } catch (err) {
        const msg = String(err?.message || err);
        // back off on rate limits, give up on anything else after 3 tries
        if (/429|rate.?limit/i.test(msg) && attempt <= 5 && !shouldStop()) {
          onEvent({ type: "wait", seconds: 60 * attempt });
          await sleep(60_000 * attempt);
          continue;
        }
        if (attempt < 3 && !shouldStop()) { await sleep(5000); continue; }
        fail++;
        onEvent({ type: "fail", id, n: i + 1, msg });
        break;
      }
    }
    await sleep(DELAY_MS);
  }
  onEvent({ type: "done", ok, fail, stopped: shouldStop() });
  return { ok, fail };
}
