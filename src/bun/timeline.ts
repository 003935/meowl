// "Load from X": the no-archive way in. Pages through your own "Posts & replies"
// timeline with your auth_token and writes tweets.json in the same shape as an
// imported archive, so the viewer and the deleter work unchanged.
//
// X only pages back through roughly your newest ~3,200 posts this way; anything
// older needs the archive.
import fs from "node:fs";
import Emusks from "emusks";
import type { Archive, Kind, Tweet } from "../shared/types";
import type { Store } from "./store";

// No fixed pause between pages: X says how many requests are left in the current
// window, and the load only waits when that runs out.
const PAGE_DELAY_MS = 0;

export type FetchEvent =
	| { type: "start"; username: string }
	| { type: "page"; fetched: number }
	| { type: "wait"; seconds: number }
	| { type: "done"; counts: Record<Kind, number>; stopped: boolean };

// The bits of emusks' parsed tweet this uses.
type XTweet = {
	id: string;
	tombstone?: boolean;
	promoted?: boolean;
	text?: string;
	created_at?: string;
	in_reply_to_status_id?: string;
	in_reply_to_user_id?: string;
	in_reply_to_screen_name?: string;
	user?: { id?: string; username?: string } | null;
	stats?: { likes?: number; retweets?: number };
	urls?: { url: string; expanded_url?: string; display_url?: string }[];
	media?: { type?: string; media_url_https?: string; video_info?: { variants?: { content_type?: string; bitrate?: number; url: string }[] } }[];
	retweeting?: XTweet | null;
};

export type TimelineClient = {
	login(token: string): Promise<unknown>;
	user?: { id?: string; username?: string } | null;
	users: { replies(userId: string, opts?: { count?: number; cursor?: string }): Promise<{ tweets: XTweet[]; nextCursor: string | null }> };
	onResponse?: (info: { name: string; status: number; headers: Record<string, string | string[] | undefined> }) => void;
};

// Photos as their image URL, videos/GIFs as the best mp4.
function mediaOf(t: XTweet): string[] {
	return (t.media ?? []).flatMap((m) => {
		const mp4s = (m.video_info?.variants ?? []).filter((v) => v.content_type === "video/mp4");
		if (mp4s.length) return [mp4s.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0].url];
		return m.media_url_https ? [m.media_url_https] : [];
	});
}

/** One timeline entry → the app's Tweet + which column it belongs in (null = not yours). */
export function toTweet(t: XTweet, selfId: string): { kind: Kind; tweet: Tweet } | null {
	if (t.tombstone || t.promoted || !t.id || t.user?.id !== selfId) return null;
	const rt = t.retweeting;
	const isReplyToOther = !rt && !!t.in_reply_to_status_id && t.in_reply_to_user_id !== selfId;
	const created_at = t.created_at ?? "";
	const src = rt ?? t;
	return {
		kind: rt ? "retweets" : isReplyToOther ? "replies" : "tweets",
		tweet: {
			id: t.id,
			created_at,
			ts: new Date(created_at).getTime(),
			// same "RT @user: …" form as the archive
			text: rt ? `RT @${rt.user?.username ?? "?"}: ${rt.text ?? ""}` : t.text ?? "",
			reply_to: isReplyToOther ? t.in_reply_to_screen_name : undefined,
			rt_of: rt ? rt.user?.username : undefined,
			likes: Number(t.stats?.likes) || 0,
			retweets_count: Number(t.stats?.retweets) || 0,
			urls: (src.urls ?? []).map((u) => ({ url: u.url, expanded: u.expanded_url, display: u.display_url })),
			media: mediaOf(src),
		},
	};
}

/**
 * Fetch every post X will page back through. Progress is saved to tweets.json
 * after each page, so the viewer can show posts while loading continues, and
 * stopping keeps what was loaded.
 */
export async function fetchTimeline({
	store,
	token,
	onEvent = () => {},
	shouldStop = () => false,
	client = new Emusks() as unknown as TimelineClient,
	delayMs = PAGE_DELAY_MS,
}: {
	store: Store;
	token: string;
	onEvent?: (e: FetchEvent) => void;
	shouldStop?: () => boolean;
	client?: TimelineClient;
	delayMs?: number;
}) {
	await client.login(token); // throws on a bad token
	const self = client.user;
	if (!self?.id) throw new Error("Logged in, but X didn't say which account this is.");

	const sleep = async (ms: number) => {
		for (let left = ms; left > 0 && !shouldStop(); left -= 1000) {
			await new Promise((r) => setTimeout(r, Math.min(1000, left)));
		}
	};

	let resetAt = 0; // epoch ms from the last x-rate-limit-reset header
	let remaining = Infinity; // requests left in this window, from x-rate-limit-remaining
	client.onResponse = ({ name, headers }) => {
		if (name !== "UserTweetsAndReplies") return;
		const h = (k: string) => [headers[k] ?? headers[k.toLowerCase()]].flat()[0];
		const reset = Number(h("x-rate-limit-reset"));
		if (reset) resetAt = reset * 1000;
		const left = h("x-rate-limit-remaining");
		if (left != null && left !== "") remaining = Number(left);
	};

	const seen = new Map<string, { kind: Kind; tweet: Tweet }>();
	function save() {
		const out: Archive = { tweets: [], replies: [], retweets: [] };
		for (const { kind, tweet } of seen.values()) out[kind].push(tweet);
		for (const list of Object.values(out)) list.sort((a, b) => a.ts - b.ts); // oldest first, like an import
		// write-then-rename, so a deletion starting mid-load never reads a half-written file
		fs.writeFileSync(`${store.TWEETS}.tmp`, JSON.stringify(out));
		fs.renameSync(`${store.TWEETS}.tmp`, store.TWEETS);
		return { tweets: out.tweets.length, replies: out.replies.length, retweets: out.retweets.length };
	}

	let cursor: string | undefined;
	let emptyPages = 0;
	// tweets.json exists (empty) before "start", so the viewer can open right away and fill in as pages arrive
	let counts = save();
	onEvent({ type: "start", username: self.username ?? "" });
	while (!shouldStop()) {
		let page: Awaited<ReturnType<TimelineClient["users"]["replies"]>>;
		for (let limited = 0; ; ) {
			try {
				page = await client.users.replies(self.id, { count: 100, cursor });
				break;
			} catch (err) {
				const e = err as { status?: number; message?: string };
				const isLimit = e?.status === 429 || /429|rate.?limit/i.test(String(e?.message || err));
				if (!isLimit || ++limited > 5) throw err;
				const ms = resetAt > Date.now() ? resetAt - Date.now() + 1000 : 60_000 * limited;
				onEvent({ type: "wait", seconds: Math.ceil(ms / 1000) });
				await sleep(ms);
				if (shouldStop()) break;
			}
		}
		if (shouldStop()) break;

		let added = 0;
		for (const t of page!.tweets) {
			if (seen.has(t.id)) continue;
			const mapped = toTweet(t, self.id);
			if (mapped) { seen.set(t.id, mapped); added++; }
		}
		counts = save();
		onEvent({ type: "page", fetched: seen.size });

		// X signals the end with no cursor, or by handing back pages with nothing new
		if (!page!.nextCursor || page!.nextCursor === cursor) break;
		emptyPages = page!.tweets.length && added ? 0 : emptyPages + 1;
		if (emptyPages >= 3) break;
		cursor = page!.nextCursor;
		// out of requests for this window: wait for the reset instead of hitting a 429
		if (remaining <= 0 && resetAt > Date.now()) {
			const ms = resetAt - Date.now() + 1000;
			onEvent({ type: "wait", seconds: Math.ceil(ms / 1000) });
			await sleep(ms);
			remaining = Infinity;
		} else await sleep(delayMs);
	}

	onEvent({ type: "done", counts, stopped: shouldStop() });
	return counts;
}
