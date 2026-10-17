// Test deletion on any account by pasting tweet links (or ids) directly.
// Use this on a throwaway account before running the viewer on your main.
//
// Preview (shows each tweet, deletes nothing):
//   X_AUTH_TOKEN=xxxx bun test-delete.ts https://x.com/user/status/123 456 ...
// Actually delete:
//   X_AUTH_TOKEN=xxxx bun test-delete.ts --confirm https://x.com/user/status/123 ...
import Emusks from "emusks";

type Fetched = { user?: { username?: string; screen_name?: string }; author?: { username?: string }; created_at?: string; text?: string };

const CONFIRM = process.argv.includes("--confirm");
const TOKEN = process.env.X_AUTH_TOKEN;
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"))
  .map((a) => a.match(/status\/(\d+)/)?.[1] || (/^\d+$/.test(a) ? a : null));

if (!TOKEN || !ids.length || ids.includes(null)) {
  console.error("Usage: X_AUTH_TOKEN=xxxx bun test-delete.ts [--confirm] <tweet link or id> ...");
  process.exit(1);
}

const client = new Emusks();
await client.login(TOKEN);

for (const id of ids) {
  let t: Fetched;
  try { t = (await client.tweets.get(id!)) as Fetched; } catch (e) { console.log(`${id}: couldn't load (${(e as Error).message})`); continue; }
  const who = t?.user?.username || t?.user?.screen_name || t?.author?.username || "?";
  console.log(`\n${id}  @${who}  ${t?.created_at ?? ""}\n  ${(t?.text ?? "").replace(/\s+/g, " ").slice(0, 100)}`);
  if (!CONFIRM) continue;
  try {
    await client.tweets.delete(id!);
    console.log("  → deleted");
  } catch (e) {
    console.log(`  → FAILED: ${(e as Error).message}`);
  }
}

console.log(CONFIRM ? "\nDone." : "\nPreview only — add --confirm to delete these.");
process.exit(0);
