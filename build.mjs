// Parse the Twitter archive's tweets.js into three lists posted before the cutoff
// (default 2024-01-01; override with CUTOFF=YYYY-MM-DD node build.mjs):
//   tweets   — standalone posts + self-reply threads
//   replies  — replies to other people
//   retweets — "RT @…" entries
// Writes tweets.json as { tweets, replies, retweets }.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARCHIVE } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ARCHIVE, "data");

const CUTOFF = new Date(`${process.env.CUTOFF || "2024-01-01"}T00:00:00Z`); // keep tweets strictly before this
if (isNaN(CUTOFF)) throw new Error(`Bad CUTOFF "${process.env.CUTOFF}" (expected YYYY-MM-DD)`);

// Your own account id, read from the archive — self-reply threads count as tweets.
const accountRaw = fs.readFileSync(path.join(DATA, "account.js"), "utf8");
const SELF = JSON.parse(accountRaw.slice(accountRaw.indexOf("[")))[0].account.accountId;

// 1) Load tweets.js (strip the `window.YTD.tweets.part0 = ` assignment prefix).
const raw = fs.readFileSync(path.join(DATA, "tweets.js"), "utf8");
const entries = JSON.parse(raw.slice(raw.indexOf("[")));

// 2) Map every media file by its leading tweet id (filename: <id>-<key>.<ext>).
const mediaByTweet = new Map();
for (const f of fs.readdirSync(path.join(DATA, "tweets_media"))) {
  const id = f.split("-")[0];
  if (!mediaByTweet.has(id)) mediaByTweet.set(id, []);
  mediaByTweet.get(id).push(f);
}

// 3) Filter + shape.
let afterCutoff = 0;
const tweets = [], replies = [], retweets = [];
for (const { tweet: t } of entries) {
  const created = new Date(t.created_at);
  if (!(created < CUTOFF)) { afterCutoff++; continue; }

  const isRetweet = (t.full_text || "").startsWith("RT @");
  const isReplyToOther = !isRetweet && t.in_reply_to_status_id_str && t.in_reply_to_user_id_str !== SELF;
  (isRetweet ? retweets : isReplyToOther ? replies : tweets).push({
    id: t.id_str,
    created_at: t.created_at,
    ts: created.getTime(),
    text: t.full_text,
    reply_to: isReplyToOther ? t.in_reply_to_screen_name : undefined,
    rt_of: isRetweet ? t.full_text.match(/^RT @(\w+)/)?.[1] : undefined,
    likes: Number(t.favorite_count) || 0,
    retweets_count: Number(t.retweet_count) || 0,
    urls: (t.entities?.urls || []).map((u) => ({ url: u.url, expanded: u.expanded_url, display: u.display_url })),
    media: mediaByTweet.get(t.id_str) || [],
  });
}

// Oldest first — "from the beginning".
tweets.sort((a, b) => a.ts - b.ts);
replies.sort((a, b) => a.ts - b.ts);
retweets.sort((a, b) => a.ts - b.ts);

fs.writeFileSync(path.join(__dirname, "tweets.json"), JSON.stringify({ tweets, replies, retweets }));
console.log(`Total entries:     ${entries.length}`);
console.log(`  excluded 2024+:    ${afterCutoff}`);
console.log(`Tweets (incl. self-threads): ${tweets.length}`);
console.log(`Replies to others:           ${replies.length}`);
console.log(`Retweets:                    ${retweets.length}`);
