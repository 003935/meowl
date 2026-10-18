import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Archive } from "../shared/types";
import { fetchTimeline, toTweet, type TimelineClient } from "./timeline";
import { openStore } from "./store";

const ME = { id: "1", username: "me" };
const OTHER = { id: "2", username: "someone" };
const at = (day: number) => new Date(Date.UTC(2025, 0, day)).toUTCString();

const post = (id: string, day: number, extra = {}) => ({ id, created_at: at(day), text: `post ${id}`, user: ME, stats: { likes: 3, retweets: 1 }, ...extra });

describe("toTweet", () => {
	test("sorts posts into tweets, replies and retweets", () => {
		expect(toTweet(post("10", 1), ME.id)?.kind).toBe("tweets");
		// replying to yourself is a thread, so it stays a tweet
		expect(toTweet(post("11", 1, { in_reply_to_status_id: "10", in_reply_to_user_id: ME.id }), ME.id)?.kind).toBe("tweets");
		const reply = toTweet(post("12", 1, { in_reply_to_status_id: "99", in_reply_to_user_id: OTHER.id, in_reply_to_screen_name: "someone" }), ME.id);
		expect(reply?.kind).toBe("replies");
		expect(reply?.tweet.reply_to).toBe("someone");
		const rt = toTweet(post("13", 1, { retweeting: { id: "98", text: "original words", user: OTHER } }), ME.id);
		expect(rt?.kind).toBe("retweets");
		expect(rt?.tweet).toMatchObject({ id: "13", text: "RT @someone: original words", rt_of: "someone" });
	});

	test("skips other people's posts, ads and deleted posts", () => {
		expect(toTweet({ ...post("20", 1), user: OTHER }, ME.id)).toBeNull();
		expect(toTweet({ ...post("21", 1), promoted: true }, ME.id)).toBeNull();
		expect(toTweet({ id: "22", tombstone: true }, ME.id)).toBeNull();
	});

	test("keeps counts, links and media (best mp4 for videos)", () => {
		const t = toTweet(
			post("30", 1, {
				urls: [{ url: "https://t.co/x", expanded_url: "https://example.com", display_url: "example.com" }],
				media: [
					{ type: "photo", media_url_https: "https://pbs.twimg.com/media/a.jpg" },
					{ type: "video", media_url_https: "https://pbs.twimg.com/thumb.jpg", video_info: { variants: [
						{ content_type: "application/x-mpegURL", url: "https://video.twimg.com/a.m3u8" },
						{ content_type: "video/mp4", bitrate: 256000, url: "https://video.twimg.com/low.mp4" },
						{ content_type: "video/mp4", bitrate: 2176000, url: "https://video.twimg.com/high.mp4?tag=12" },
					] } },
				],
			}),
			ME.id,
		)!.tweet;
		expect(t.likes).toBe(3);
		expect(t.retweets_count).toBe(1);
		expect(t.urls).toEqual([{ url: "https://t.co/x", expanded: "https://example.com", display: "example.com" }]);
		expect(t.media).toEqual(["https://pbs.twimg.com/media/a.jpg", "https://video.twimg.com/high.mp4?tag=12"]);
	});
});

// Fake X serving `pages` in order, one per cursor.
function fakeClient(pages: { tweets: ReturnType<typeof post>[] }[], opts: { onPage?: (i: number) => void } = {}) {
	const c: TimelineClient & { calls: number } = {
		calls: 0,
		user: null,
		login: async () => { c.user = ME; },
		users: {
			async replies(_userId, { cursor } = {}) {
				const i = cursor ? Number(cursor) : 0;
				c.calls++;
				opts.onPage?.(i);
				return { tweets: pages[i]?.tweets ?? [], nextCursor: i + 1 < pages.length ? String(i + 1) : null };
			},
		},
	};
	return c;
}

function tempStore() {
	return openStore(fs.mkdtempSync(path.join(os.tmpdir(), "timeline-test-")));
}
const saved = (store: ReturnType<typeof openStore>): Archive => JSON.parse(fs.readFileSync(store.TWEETS, "utf8"));

describe("fetchTimeline", () => {
	test("pages through the whole timeline and saves it oldest first", async () => {
		const store = tempStore();
		const client = fakeClient([
			{ tweets: [post("3", 3), { ...post("50", 2), user: OTHER }, post("2", 2)] },
			{ tweets: [post("2", 2), post("1", 1, { in_reply_to_status_id: "50", in_reply_to_user_id: OTHER.id })] }, // "2" again: no duplicate
		]);
		const counts = await fetchTimeline({ store, token: "x", client, delayMs: 0 });

		expect(counts).toEqual({ tweets: 2, replies: 1, retweets: 0 });
		expect(saved(store).tweets.map((t) => t.id)).toEqual(["2", "3"]);
		expect(saved(store).replies.map((t) => t.id)).toEqual(["1"]);
		expect(client.calls).toBe(2);
	});

	test("stopping keeps what already loaded", async () => {
		const store = tempStore();
		let stop = false;
		const client = fakeClient(
			[{ tweets: [post("1", 1)] }, { tweets: [post("2", 2)] }, { tweets: [post("3", 3)] }],
			{ onPage: (i) => { if (i === 1) stop = true; } },
		);
		await fetchTimeline({ store, token: "x", client, delayMs: 0, shouldStop: () => stop });
		expect(saved(store).tweets.map((t) => t.id)).toEqual(["1"]);
	});

	test("waits for the rate-limit reset when X says no requests are left", async () => {
		const store = tempStore();
		const client = fakeClient([{ tweets: [post("1", 1)] }, { tweets: [post("2", 2)] }], {
			onPage: (i) => {
				if (i === 0) client.onResponse?.({ name: "UserTweetsAndReplies", status: 200, headers: { "x-rate-limit-remaining": "0", "x-rate-limit-reset": String(Math.ceil(Date.now() / 1000)) } });
			},
		});
		const events: string[] = [];
		await fetchTimeline({ store, token: "x", client, onEvent: (e) => events.push(e.type) });
		expect(events).toContain("wait");
		expect(saved(store).tweets.map((t) => t.id)).toEqual(["1", "2"]);
	});

	test("gives up when X keeps handing back pages with nothing new", async () => {
		const store = tempStore();
		const same = { tweets: [post("1", 1)] };
		const client = fakeClient([same, same, same, same, same, same, same, same]);
		await fetchTimeline({ store, token: "x", client, delayMs: 0 });
		expect(client.calls).toBeLessThan(8);
		expect(saved(store).tweets.length).toBe(1);
	});
});
