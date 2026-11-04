import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { downloadMedia, itemsOf, parseUsername, saveFiles, scanMedia, type MediaClient } from "./media";
import type { MediaItem } from "../shared/types";

const photo = (id: string, userId = "1") => ({
	id,
	created_at: "Fri Mar 01 12:00:00 +0000 2024",
	user: { id: userId },
	media: [{ type: "photo", media_url_https: `https://pbs.twimg.com/media/${id}.png` }],
});

function fakeClient(pages: { tweets: unknown[]; nextCursor: string | null }[]) {
	const calls: (string | undefined)[] = [];
	const client = {
		login: async (t: string) => { if (t === "bad") throw new Error("failed to log in"); },
		users: {
			getByUsername: async () => ({ id: "1", username: "Someone", stats: { media: 3 } }),
			userMedia: async (_id: string, opts?: { cursor?: string }) => {
				calls.push(opts?.cursor);
				return pages[calls.length - 1] ?? { tweets: [], nextCursor: null };
			},
		},
	} as unknown as MediaClient;
	return { client, calls };
}

const okFetch = async () => new Response("bytes");

describe("parseUsername", () => {
	test.each([
		["someone", "someone"],
		["@some_one", "some_one"],
		["  @someone ", "someone"],
		["https://x.com/someone", "someone"],
		["https://twitter.com/someone/media", "someone"],
		["x.com/someone?s=20", "someone"],
	])("%s", (input, want) => expect(parseUsername(input)).toBe(want));

	test.each(["", "has space", "much_too_long_for_a_username", "https://example.com/someone", "../etc"])("rejects %s", (input) => {
		expect(parseUsername(input)).toBeNull();
	});
});

describe("itemsOf", () => {
	const t = {
		id: "9",
		text: "hello",
		created_at: "Fri Mar 01 12:00:00 +0000 2024",
		media: [
			{ type: "photo", media_url_https: "https://pbs.twimg.com/media/a.jpg" },
			{ type: "video", media_url_https: "https://pbs.twimg.com/poster.jpg", video_info: { duration_millis: 2500, variants: [
				{ content_type: "application/x-mpegURL", url: "https://video.twimg.com/a.m3u8" },
				{ content_type: "video/mp4", bitrate: 100, url: "https://video.twimg.com/low.mp4" },
				{ content_type: "video/mp4", bitrate: 900, url: "https://video.twimg.com/high.mp4" },
			] } },
			{ type: "animated_gif", media_url_https: "https://pbs.twimg.com/gif.jpg", video_info: { variants: [{ content_type: "video/mp4", url: "https://video.twimg.com/gif.mp4" }] } },
		],
	};

	test("photos at original size, the best mp4, dated names, thumbnails", () => {
		const shared = { tweetUrl: "https://x.com/someone/status/9", text: "hello", createdAt: t.created_at };
		expect(itemsOf(t, "someone")).toEqual([
			{ ...shared, name: "2024-03-01_9_1.jpg", kind: "photo", url: "https://pbs.twimg.com/media/a.jpg?name=orig", thumb: "https://pbs.twimg.com/media/a.jpg?name=small" },
			{ ...shared, name: "2024-03-01_9_2.mp4", kind: "video", url: "https://video.twimg.com/high.mp4", thumb: "https://pbs.twimg.com/poster.jpg?name=small", duration: 2.5 },
			{ ...shared, name: "2024-03-01_9_3.mp4", kind: "gif", url: "https://video.twimg.com/gif.mp4", thumb: "https://pbs.twimg.com/gif.jpg?name=small" },
		]);
	});

	test("ignores anything not on X's CDN", () => {
		expect(itemsOf({ id: "1", media: [{ type: "photo", media_url_https: "https://evil.example/twimg.com/a.jpg" }] }, "someone")).toEqual([]);
	});
});

describe("scanMedia", () => {
	test("pages through, reporting only the account's own posts and saving nothing", async () => {
		const { client, calls } = fakeClient([
			{ tweets: [photo("a"), photo("other", "2"), { ...photo("ad"), promoted: true }, { ...photo("rt"), retweeting: photo("x", "2") }], nextCursor: "c1" },
			{ tweets: [photo("a"), photo("b")], nextCursor: null },
		]);
		const found: MediaItem[] = [];
		const r = await scanMedia({ username: "someone", token: "t", client, onItems: (items) => { found.push(...items); } });
		expect(r).toEqual({ username: "Someone", posts: 2, found: 2, stopped: false });
		expect(calls).toEqual([undefined, "c1"]);
		expect(found.map((i) => i.name)).toEqual(["2024-03-01_a_1.png", "2024-03-01_b_1.png"]);
	});

	test("stops on request", async () => {
		const { client, calls } = fakeClient([{ tweets: [photo("a")], nextCursor: "c1" }, { tweets: [photo("b")], nextCursor: null }]);
		let stop = false;
		const r = await scanMedia({ username: "someone", token: "t", client, shouldStop: () => stop, onItems: () => { stop = true; } });
		expect(r.stopped).toBe(true);
		expect(calls.length).toBe(1);
	});

	test("rejects a bad token and an unknown account", async () => {
		const { client } = fakeClient([]);
		await expect(scanMedia({ username: "someone", token: "bad", client, onItems: () => {} })).rejects.toThrow(/failed to log in/);
		client.users.getByUsername = async () => { throw new Error("couldn't get user, response: {}"); };
		await expect(scanMedia({ username: "nobody", token: "t", client, onItems: () => {} })).rejects.toThrow(/Couldn't find @nobody/);
	});
});

describe("saving", () => {
	let outDir: string;
	beforeEach(() => { outDir = fs.mkdtempSync(path.join(os.tmpdir(), "media-test-")); });
	afterEach(() => fs.rmSync(outDir, { recursive: true, force: true }));
	const file = (name: string) => ({ url: `https://pbs.twimg.com/${name}`, name });

	test("saves only the items it's given", async () => {
		const r = await saveFiles({ items: [file("a.png"), file("b.png")], dir: outDir, fetchFile: okFetch });
		expect(r).toEqual({ downloaded: 2, skipped: 0, failed: 0 });
		expect(fs.readdirSync(outDir).sort()).toEqual(["a.png", "b.png"]);
	});

	test("a rerun skips files already saved", async () => {
		await saveFiles({ items: [file("a.png")], dir: outDir, fetchFile: okFetch });
		const r = await saveFiles({ items: [file("a.png")], dir: outDir, fetchFile: okFetch });
		expect(r).toMatchObject({ downloaded: 0, skipped: 1 });
	});

	test("a failed file is counted, leaves no partial file, and the run carries on", async () => {
		const fetchFile = async (url: string) => (url.includes("a.png") ? new Response("no", { status: 404 }) : new Response("bytes"));
		const r = await saveFiles({ items: [file("a.png"), file("b.png")], dir: outDir, fetchFile });
		expect(r).toMatchObject({ downloaded: 1, failed: 1 });
		expect(fs.readdirSync(outDir)).toEqual(["b.png"]);
	});

	test("stops on request", async () => {
		let stop = false;
		const r = await saveFiles({ items: Array.from({ length: 20 }, (_, i) => file(`${i}.png`)), dir: outDir, fetchFile: okFetch, shouldStop: () => stop, onEvent: () => { stop = true; } });
		expect(r.downloaded).toBeLessThan(20);
	});

	test("downloadMedia saves everything of the chosen types to the account's folder", async () => {
		const video = { id: "v", created_at: photo("v").created_at, user: { id: "1" }, media: [{ type: "video", video_info: { variants: [{ content_type: "video/mp4", url: "https://video.twimg.com/v.mp4" }] } }] };
		const { client } = fakeClient([{ tweets: [photo("a"), video], nextCursor: null }]);
		const r = await downloadMedia({ username: "someone", token: "t", outDir, client, fetchFile: okFetch, types: { photos: false, videos: true, gifs: true } });
		expect(r).toEqual({ downloaded: 1, skipped: 0, failed: 0, stopped: false });
		expect(fs.readdirSync(path.join(outDir, "Someone"))).toEqual(["2024-03-01_v_1.mp4"]);
	});
});
