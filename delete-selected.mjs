// Command-line alternative to the website's delete button.
// Deletes the tweets ticked in the viewer (viewer/selected.json).
//
// Dry run (default — prints what it would delete):
//   node delete-selected.mjs
// Actually delete:
//   X_AUTH_TOKEN=xxxx node delete-selected.mjs --confirm
import { loadArchive, pendingIds, runDeletion } from "./deleter.mjs";

const CONFIRM = process.argv.includes("--confirm");
const TOKEN = process.env.X_AUTH_TOKEN;

const { byId, replyIds, rtIds } = loadArchive();
const queue = pendingIds();

if (!queue.length) { console.log("Nothing selected. Tick tweets in the viewer first."); process.exit(0); }

const kinds = { tweets: 0, replies: 0, retweets: 0 };
for (const id of queue) kinds[rtIds.has(id) ? "retweets" : replyIds.has(id) ? "replies" : "tweets"]++;
console.log(`${queue.length} selected (${kinds.tweets} tweets, ${kinds.replies} replies, ${kinds.retweets} retweets).`);

if (!CONFIRM) {
  for (const id of queue) {
    const t = byId.get(id);
    console.log(`  ${id}  ${t?.created_at ?? "?"}  ${(t?.text ?? "").replace(/\s+/g, " ").slice(0, 70)}`);
  }
  console.log(`\nDRY RUN — nothing deleted. Re-run with --confirm to delete these ${queue.length}.`);
  process.exit(0);
}

if (!TOKEN) { console.error("Set X_AUTH_TOKEN to your auth_token cookie value."); process.exit(1); }

let total = 0;
await runDeletion({
  token: TOKEN,
  onEvent: (e) => {
    if (e.type === "start") total = e.total;
    if (e.type === "ok") console.log(`[${e.n}/${total}] deleted ${e.id}`);
    if (e.type === "fail") console.error(`[${e.n}/${total}] FAILED ${e.id}: ${e.msg}`);
    if (e.type === "wait") console.warn(`  rate limited, waiting ${e.seconds}s…`);
    if (e.type === "done") console.log(`\nDone. Deleted ${e.ok}, failed ${e.fail}. Failed ids stay ticked in the viewer.`);
  },
});
