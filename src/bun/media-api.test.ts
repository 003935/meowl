import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMediaApi, type Tokens } from "./media-api";
import { openStore } from "./store";
import type { DownloadProgress, MediaItem, ScanProgress } from "../shared/types";
import type { MediaClient } from "./media";

const TOKEN = "a".repeat(40);
let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "meowl-media-")); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const fakeClient = (): MediaClient => ({
	login: async (t: string) => { if (t !== TOKEN) throw new Error("failed to log in"); },
	users: {
		getByUsername: async () => ({ id: "1", username: "Someone", stats: { media: 2 } }),
		userMedia: async () => ({
			tweets: ["10", "11"].map((id) => ({
				id,
				created_at: "Fri Mar 01 12:00:00 +0000 2024",
				user: { id: "1" },
				media: [{ type: "photo", media_url_https: `https://pbs.twimg.com/media/${id}.png` }],
			})),
			nextCursor: null,
		}),
	},
});

function setup() {
	const store = openStore(path.join(tmp, "data"));
	store.saveSettings({ source: "archive", archivePath: "/some/archive" });
	let saved: string | null = null;
	const tokens: Tokens = {
		saved: () => saved,
		remember: (t) => { saved = t; },
		forget: () => { saved = null; },
		from: (b) => (b?.useSaved ? saved ?? { error: "none" } : String(b?.token)),
	};
	const api = createMediaApi({
		store,
		defaultOutDir: path.join(tmp, "out"),
		tokens,
		pickFolder: async () => path.join(tmp, "picked"),
		reveal: () => {},
		client: fakeClient,
		fetchFile: async () => new Response("bytes"),
	});
	const call = async <T>(p: string, body?: unknown) => {
		const url = new URL(`http://127.0.0.1${p}`);
		const req = new Request(url, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
		const r = (await api.handle(req, url, url.pathname))!;
		return { status: r.status, body: (await r.json()) as T };
	};
	const until = async (p: string, done: (b: { running: boolean }) => boolean) => {
		for (let i = 0; i < 100; i++) {
			const { body } = await call<{ running: boolean }>(p);
			if (done(body)) return;
			await Bun.sleep(10);
		}
		throw new Error(`timed out waiting on ${p}`);
	};
	return { store, call, until, tokens };
}

test("ignores paths outside /api/media", async () => {
	const store = openStore(path.join(tmp, "data"));
	const api = createMediaApi({ store, defaultOutDir: tmp, tokens: {} as Tokens, pickFolder: async () => null, reveal: () => {} });
	const url = new URL("http://127.0.0.1/api/state");
	expect(await api.handle(new Request(url), url, url.pathname)).toBeNull();
});

test("a rejected token reports 401 and keeps nothing", async () => {
	const { call, tokens } = setup();
	const r = await call<{ error: string }>("/api/media/scan", { username: "someone", token: "b".repeat(40) });
	expect(r.status).toBe(401);
	expect(r.body.error).toMatch(/didn't accept/);
	expect(tokens.saved()).toBeNull();
	expect((await call<ScanProgress>("/api/media/scan/progress")).body.username).toBe("");
});

test("scans, then downloads only the ticked items into <folder>/<username>", async () => {
	const { call, until, tokens } = setup();
	expect((await call("/api/media/scan", { username: "@someone", token: TOKEN })).status).toBe(202);
	expect(tokens.saved()).toBe(TOKEN); // shared with the rest of the app
	await until("/api/media/scan/progress", (s) => !s.running);

	const items = (await call<MediaItem[]>("/api/media/items?from=0")).body;
	expect(items.map((i) => i.name)).toEqual(["2024-03-01_10_1.png", "2024-03-01_11_1.png"]);
	expect((await call<MediaItem[]>("/api/media/items?from=1")).body).toHaveLength(1);

	expect((await call("/api/media/download", ["2024-03-01_11_1.png", "../evil"])).status).toBe(202);
	await until("/api/media/download/progress", (d) => !d.running);
	const d = (await call<DownloadProgress>("/api/media/download/progress")).body;
	expect(d.downloaded).toBe(1);
	expect(fs.readdirSync(path.join(tmp, "out", "Someone"))).toEqual(["2024-03-01_11_1.png"]);
	expect((await call<string[]>("/api/media/saved")).body).toEqual(["2024-03-01_11_1.png"]);
});

test("picking a folder keeps the other settings", async () => {
	const { call, store } = setup();
	expect((await call<{ path: string }>("/api/media/pick", {})).body.path).toBe(path.join(tmp, "picked"));
	expect(store.settings()).toEqual({ source: "archive", archivePath: "/some/archive", mediaOutDir: path.join(tmp, "picked") });
	expect((await call<{ outDir: string }>("/api/media/state")).body.outDir).toBe(path.join(tmp, "picked"));
});
