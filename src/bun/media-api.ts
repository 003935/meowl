// "Download media": find an account's photos, videos and GIFs and save the ones you
// tick. Mounted by server.ts under /api/media/…
//   GET  /api/media/state      -> {outDir}  the save folder
//   POST /api/media/pick       -> opens a native folder picker, saves and returns {path}
//   POST /api/media/scan       <- {username, token} or {username, useSaved: true}  find the account's media
//   GET  /api/media/scan/progress -> state of that scan   POST /api/media/scan/stop  stop it, keeping what loaded
//   GET  /api/media/items?from=n  -> the items found so far, from index n
//   GET  /api/media/saved      -> names of the files already in this account's folder
//   POST /api/media/download   <- {names}  save those items
//   GET  /api/media/download/progress -> state of that run  POST /api/media/download/stop  stop it
//   POST /api/media/reveal     show this account's folder in the file manager
//
// The auth token is shared with the rest of the app (remembered in memory only, never
// on disk). The media files come from X's public CDN without it.
import fs from "node:fs";
import path from "node:path";
import { parseUsername, saveFiles, scanMedia, type MediaClient } from "./media";
import type { Store } from "./store";
import type { DownloadProgress, MediaItem, MediaState, ScanProgress } from "../shared/types";

export type Tokens = {
	saved: () => string | null;
	remember: (token: string) => void;
	forget: () => void;
	/** {token} or {useSaved: true} → the token to use, or an error message */
	from: (body: { token?: unknown; useSaved?: unknown } | null) => string | { error: string };
};

type Options = {
	store: Store;
	defaultOutDir: string;
	tokens: Tokens;
	pickFolder: (startingFolder: string) => Promise<string | null>;
	reveal: (dir: string) => void;
	// for tests: stand-ins for X and its CDN
	client?: () => MediaClient;
	fetchFile?: (url: string) => Promise<Response>;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });

export function createMediaApi({ store, defaultOutDir, tokens, pickFolder, reveal, client, fetchFile }: Options) {
	const outDir = () => store.settings().mediaOutDir || defaultOutDir;

	// ---- scan job state (one at a time, never replacing items a download is using) ----
	const idleScan = (id: number): ScanProgress => ({ id, running: false, stopping: false, stopped: false, username: "", mediaPosts: 0, posts: 0, waiting: 0, error: null });
	let scan = idleScan(0);
	let scanStop = false;
	let items: MediaItem[] = [];

	const accountDir = () => path.join(outDir(), scan.username);

	/**
	 * Start a scan. Resolves once X has accepted the token and found the account (the
	 * scan then carries on in the background); rejects with a readable message if not,
	 * in which case the previous scan is kept, so the UI can just ask again.
	 */
	function startScan(username: string, token: string): Promise<void> {
		const previous = scan;
		scanStop = false;
		scan = { ...idleScan(previous.id + 1), running: true };
		let started = false;
		let settle!: { ok: () => void; fail: (msg: string) => void };
		const ready = new Promise<void>((ok, fail) => (settle = { ok, fail: (msg) => fail(new Error(msg)) }));
		scanMedia({
			username,
			token,
			shouldStop: () => scanStop,
			...(client && { client: client() }),
			onItems: (found) => { items.push(...found); },
			onEvent: (e) => {
				if (e.type === "login") tokens.remember(token);
				if (e.type === "start") {
					started = true;
					items = [];
					download = idleDownload();
					scan.username = e.username;
					scan.mediaPosts = e.mediaPosts;
					settle.ok();
				}
				if (e.type === "page") { scan.posts = e.posts; scan.waiting = 0; }
				if (e.type === "wait") scan.waiting = e.seconds;
				if (e.type === "done") scan.stopped = e.stopped;
			},
		})
			.catch((err) => {
				const msg = String(err?.message || err);
				if (!started) {
					const rejected = /failed to log in/i.test(msg);
					if (rejected && token === tokens.saved()) tokens.forget(); // expired, or logged out of X since
					scan = previous;
					settle.fail(rejected ? "X didn't accept that auth_token. Paste the correct one and try again." : msg);
					return;
				}
				scan.error = msg;
			})
			.finally(() => { scan.running = false; scan.stopping = false; scan.waiting = 0; });
		return ready;
	}

	// ---- download job state (one at a time; can run while the scan carries on) ----
	const idleDownload = (): DownloadProgress => ({ running: false, stopping: false, stopped: false, dir: "", total: 0, downloaded: 0, skipped: 0, failed: 0, bytes: 0, error: null, log: [] });
	let download = idleDownload();
	let downloadStop = false;

	function logLine(s: string) {
		download.log.push(`${new Date().toLocaleTimeString()}  ${s}`);
		if (download.log.length > 100) download.log.shift();
	}

	function startDownload(chosen: MediaItem[]) {
		downloadStop = false;
		download = { ...idleDownload(), running: true, dir: accountDir(), total: chosen.length };
		const job = download;
		saveFiles({
			items: chosen,
			dir: job.dir,
			shouldStop: () => downloadStop,
			...(fetchFile && { fetchFile }),
			onEvent: (e) => {
				if (e.type === "file") { job.downloaded++; job.bytes += e.bytes; logLine(`saved ${e.name}`); }
				if (e.type === "skip") job.skipped++;
				if (e.type === "fail") { job.failed++; logLine(`FAILED ${e.name}: ${e.msg}`); }
			},
		})
			.then((r) => {
				job.stopped = downloadStop;
				logLine(`${job.stopped ? "Stopped" : "Done"}. Saved ${r.downloaded}, already had ${r.skipped}, failed ${r.failed}.`);
			})
			.catch((err) => { job.error = String(err?.message || err); })
			.finally(() => { job.running = false; job.stopping = false; });
	}

	function savedNames() {
		if (!scan.username) return [];
		try {
			return fs.readdirSync(accountDir()).filter((n) => !n.endsWith(".part"));
		} catch {
			return []; // nothing saved yet
		}
	}

	async function readJson(req: Request, limit = 2_000_000) {
		const text = await req.text();
		if (text.length > limit) throw new Error("too large");
		return JSON.parse(text || "null");
	}

	/** Handles /api/media/… requests; null for any other path. */
	async function handle(req: Request, url: URL, p: string): Promise<Response | null> {
		if (!p.startsWith("/api/media/")) return null;
		const route = p.slice("/api/media".length);
		const post = req.method === "POST";

		if (route === "/state") return json({ outDir: outDir() } satisfies MediaState);

		if (route === "/pick" && post) {
			if (download.running) return json({ error: "Wait for the running download to finish first." }, 409);
			const picked = await pickFolder(outDir());
			if (picked) store.saveSettings({ ...store.settings(), mediaOutDir: picked });
			return json({ path: picked });
		}

		if (route === "/scan" && post) {
			if (scan.running) return json({ error: "Already looking through an account." }, 409);
			if (download.running) return json({ error: "Wait for the running download to finish first." }, 409);
			const body = await readJson(req, 10_000);
			const username = parseUsername(String(body?.username || ""));
			if (!username) return json({ error: "That doesn't look like an X username or profile link." }, 400);
			const token = tokens.from(body);
			if (typeof token !== "string") return json(token, 400);
			try {
				await startScan(username, token); // wait for X to accept the login
			} catch (e) {
				return json({ error: (e as Error).message, tokenSaved: !!tokens.saved() }, 401);
			}
			return json({ started: true }, 202);
		}
		if (route === "/scan/progress") return json(scan);
		if (route === "/scan/stop" && post) {
			if (scan.running) { scanStop = true; scan.stopping = true; }
			return json({ stopping: scan.running });
		}
		if (route === "/items") return json(items.slice(Number(url.searchParams.get("from")) || 0));
		if (route === "/saved") return json(savedNames());

		if (route === "/download" && post) {
			if (download.running) return json({ error: "A download is already running." }, 409);
			const names = await readJson(req);
			if (!Array.isArray(names)) return json({ error: "bad names" }, 400);
			// only ever items this scan found, so the UI can't point a download anywhere else
			const wanted = new Set(names);
			const chosen = items.filter((i) => wanted.has(i.name));
			if (!chosen.length) return json({ error: "Nothing is ticked." }, 400);
			startDownload(chosen);
			return json({ started: true }, 202);
		}
		if (route === "/download/progress") return json(download);
		if (route === "/download/stop" && post) {
			if (download.running) { downloadStop = true; download.stopping = true; logLine("Stopping…"); }
			return json({ stopping: download.running });
		}

		if (route === "/reveal" && post) {
			if (!scan.username) return json({ revealed: false });
			const dir = accountDir();
			fs.mkdirSync(dir, { recursive: true });
			reveal(dir);
			return json({ revealed: true });
		}

		return json({ error: "not found" }, 404);
	}

	return { handle };
}
