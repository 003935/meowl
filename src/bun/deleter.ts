// Shared deletion logic used by both the desktop app (server.ts) and
// delete-selected.ts (command line).
//
// Each success is appended to deleted.json and removed from selected.json right
// away, so stopping or crashing mid-run loses nothing and a re-run resumes.
import fs from "node:fs";
import Emusks from "emusks";
import type { Archive } from "../shared/types";
import type { Store } from "./store";

const DELAY_MS = 1500;

export type DeleteEvent =
	| { type: "start"; total: number }
	| { type: "ok"; id: string; n: number }
	| { type: "fail"; id: string; n: number; msg: string }
	| { type: "wait"; seconds: number }
	| { type: "done"; ok: number; fail: number; stopped: boolean };

export function loadArchive(store: Store) {
	const { tweets, replies, retweets }: Archive = JSON.parse(fs.readFileSync(store.TWEETS, "utf8"));
	return {
		byId: new Map([...tweets, ...replies, ...retweets].map((t) => [t.id, t])),
		replyIds: new Set(replies.map((t) => t.id)),
		rtIds: new Set(retweets.map((t) => t.id)),
	};
}

// The pending queue: ticked ids that haven't been deleted yet.
export function pendingIds(store: Store) {
	const deleted = new Set(store.readIds("deleted.json"));
	return store.readIds("selected.json").filter((id) => !deleted.has(id));
}

function markDeleted(store: Store, id: string) {
	const deleted = new Set(store.readIds("deleted.json"));
	deleted.add(id);
	store.writeIds("deleted.json", [...deleted]);
	// re-read selected.json so ticks made in the viewer during the run are kept
	store.writeIds("selected.json", store.readIds("selected.json").filter((x) => !deleted.has(x)));
}

/**
 * Delete every pending id. `onEvent` receives progress events (see DeleteEvent).
 * `shouldStop()` is polled between deletes (and during rate-limit waits).
 */
export async function runDeletion({
	store,
	token,
	onEvent = () => {},
	shouldStop = () => false,
}: {
	store: Store;
	token: string;
	onEvent?: (e: DeleteEvent) => void;
	shouldStop?: () => boolean;
}) {
	const { rtIds } = loadArchive(store);
	const queue = pendingIds(store);

	const client = new Emusks();
	await client.login(token); // throws on a bad token

	// sleep in 1s steps so a stop request takes effect quickly
	const sleep = async (ms: number) => {
		for (let left = ms; left > 0 && !shouldStop(); left -= 1000) {
			await new Promise((r) => setTimeout(r, Math.min(1000, left)));
		}
	};

	// emusks only throws when X returns errors with no data at all; a response that
	// carries both is passed through. Treat any reported error as a failure so a
	// delete never counts as done unless X said nothing went wrong.
	const strict = <T>(res: T) => {
		const errors = (res as { errors?: { message: string }[] })?.errors;
		if (errors?.length) throw new Error(errors.map((e) => e.message).join(", "));
		return res;
	};
	const deleteTweet = async (id: string) => strict(await client.tweets.delete(id));

	// Retweets: the archive only has the retweet's own id. Try deleting that first;
	// if X refuses, look up the original tweet and undo the retweet on it instead.
	async function removeRetweet(id: string) {
		try {
			return await deleteTweet(id);
		} catch (err) {
			const t = await client.tweets.get(id);
			const src = (t as { retweeting?: { id?: string } })?.retweeting?.id;
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
				markDeleted(store, id);
				ok++;
				onEvent({ type: "ok", id, n: i + 1 });
				break;
			} catch (err) {
				const msg = String((err as Error)?.message || err);
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
