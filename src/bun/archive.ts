// Parse the Twitter archive's tweets.js into three lists:
//   tweets   — standalone posts + self-reply threads
//   replies  — replies to other people
//   retweets — "RT @…" entries
// Writes tweets.json as { tweets, replies, retweets } into the app's data folder.
import fs from "node:fs";
import path from "node:path";
import type { Archive, ImportResult, Tweet } from "../shared/types";
import type { Store } from "./store";

type RawTweet = {
	id_str: string;
	created_at: string;
	full_text?: string;
	in_reply_to_status_id_str?: string;
	in_reply_to_user_id_str?: string;
	in_reply_to_screen_name?: string;
	favorite_count?: string;
	retweet_count?: string;
	entities?: { urls?: { url: string; expanded_url?: string; display_url?: string }[] };
};

// Archive .js files are `window.YTD.<name>.partN = [ … ]`; strip the assignment.
const readYtd = <T>(file: string): T[] => {
	const raw = fs.readFileSync(file, "utf8");
	return JSON.parse(raw.slice(raw.indexOf("[")));
};

export const mediaDir = (archivePath: string) => path.join(archivePath, "data", "tweets_media");

/** Throws a readable error if `archivePath` isn't an unzipped X archive. */
export function checkArchive(archivePath: string) {
	const data = path.join(archivePath, "data");
	if (!fs.existsSync(path.join(data, "tweets.js"))) {
		throw new Error(`No data/tweets.js in "${archivePath}". Pick the unzipped archive folder (the one with "Your archive.html").`);
	}
}

export function importArchive(store: Store, archivePath: string): ImportResult {
	checkArchive(archivePath);
	const DATA = path.join(archivePath, "data");


	// Your own account id, read from the archive — self-reply threads count as tweets.
	const account = fs.existsSync(path.join(DATA, "account.js"))
		? readYtd<{ account: { accountId: string } }>(path.join(DATA, "account.js"))[0]?.account
		: undefined;
	const SELF = account?.accountId;

	// 1) Load tweets.js (large archives split the rest into tweets-part1.js, …).
	const parts = fs.readdirSync(DATA).filter((f) => /^tweets(-part\d+)?\.js$/.test(f));
	const entries = parts.flatMap((f) => readYtd<{ tweet: RawTweet }>(path.join(DATA, f)));

	// 2) Map every media file by its leading tweet id (filename: <id>-<key>.<ext>).
	const mediaByTweet = new Map<string, string[]>();
	if (fs.existsSync(mediaDir(archivePath))) {
		for (const f of fs.readdirSync(mediaDir(archivePath))) {
			const id = f.split("-")[0];
			if (!mediaByTweet.has(id)) mediaByTweet.set(id, []);
			mediaByTweet.get(id)!.push(f);
		}
	}

	// 3) Filter + shape.
	const out: Archive = { tweets: [], replies: [], retweets: [] };
	for (const { tweet: t } of entries) {
		const created = new Date(t.created_at);

		const text = t.full_text || "";
		const isRetweet = text.startsWith("RT @");
		const isReplyToOther = !isRetweet && !!t.in_reply_to_status_id_str && t.in_reply_to_user_id_str !== SELF;
		const item: Tweet = {
			id: t.id_str,
			created_at: t.created_at,
			ts: created.getTime(),
			text,
			reply_to: isReplyToOther ? t.in_reply_to_screen_name : undefined,
			rt_of: isRetweet ? text.match(/^RT @(\w+)/)?.[1] : undefined,
			likes: Number(t.favorite_count) || 0,
			retweets_count: Number(t.retweet_count) || 0,
			urls: (t.entities?.urls || []).map((u) => ({ url: u.url, expanded: u.expanded_url, display: u.display_url })),
			media: mediaByTweet.get(t.id_str) || [],
		};
		(isRetweet ? out.retweets : isReplyToOther ? out.replies : out.tweets).push(item);
	}

	// Oldest first — "from the beginning".
	for (const list of Object.values(out)) list.sort((a, b) => a.ts - b.ts);

	fs.writeFileSync(store.TWEETS, JSON.stringify(out));
	return {
		total: entries.length,
		counts: { tweets: out.tweets.length, replies: out.replies.length, retweets: out.retweets.length },
	};
}
