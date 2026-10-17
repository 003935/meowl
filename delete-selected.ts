// Command-line alternative to the app's delete button.
// Deletes the tweets ticked in the app. Point it at the app's data folder (shown
// under "How do I get my auth_token?" in the app's delete dialog) with --data or TWEET_DELETER_DATA.
//
// Dry run (default — prints what it would delete):
//   bun delete-selected.ts --data "<data folder>"
// Actually delete:
//   X_AUTH_TOKEN=xxxx bun delete-selected.ts --data "<data folder>" --confirm
import { loadArchive, pendingIds, runDeletion } from "./src/bun/deleter";
import { openStore } from "./src/bun/store";

const CONFIRM = process.argv.includes("--confirm");
const TOKEN = process.env.X_AUTH_TOKEN;
const dataArg = process.argv.indexOf("--data");
const DATA = dataArg > 0 ? process.argv[dataArg + 1] : process.env.TWEET_DELETER_DATA;

if (!DATA) {
  console.error('Pass the app\'s data folder: bun delete-selected.ts --data "<folder>" (it\'s shown in the app\'s delete dialog).');
  process.exit(1);
}

const store = openStore(DATA);
const { byId, replyIds, rtIds } = loadArchive(store);
const queue = pendingIds(store);

if (!queue.length) { console.log("Nothing selected. Tick tweets in the app first."); process.exit(0); }

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
  store,
  token: TOKEN,
  onEvent: (e) => {
    if (e.type === "start") total = e.total;
    if (e.type === "ok") console.log(`[${e.n}/${total}] deleted ${e.id}`);
    if (e.type === "fail") console.error(`[${e.n}/${total}] FAILED ${e.id}: ${e.msg}`);
    if (e.type === "wait") console.warn(`  rate limited, waiting ${e.seconds}s…`);
    if (e.type === "done") console.log(`\nDone. Deleted ${e.ok}, failed ${e.fail}. Failed ids stay ticked in the app.`);
  },
});
process.exit(0);
