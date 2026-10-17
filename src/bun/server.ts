// Local server inside the desktop app: serves the UI and the archive's media,
// persists the delete selection, and runs deletions.
//   GET  /api/state      -> archive path, whether it's imported, counts
//   POST /api/pick       -> opens a native folder picker, returns {path}
//   POST /api/import     <- {archivePath}  parse the archive into tweets.json
//   GET  /api/tweets     -> { tweets, replies, retweets }
//   GET  /api/selection  -> ticked ids          POST <- ticked ids
//   GET  /api/deleted    -> ids already deleted
//   POST /api/delete     <- {token} or {useSaved: true}  start deleting every ticked id
//   GET  /api/token      -> {saved}  whether an accepted token is remembered this session
//   POST /api/token/forget  drop the remembered token
//   POST /api/stop       stop the running deletion after the current tweet
//   GET  /api/progress   -> state of the current/last deletion run
//   POST /api/open       <- {url}  open an x.com / https link in the default browser
//   GET  /media/<file>   -> a file from the archive's data/tweets_media
//
// The auth token is never written to disk or sent anywhere except X. Once X accepts
// it, it's remembered in this process's memory until the app quits, so later runs
// don't ask again; the UI only ever learns whether one is saved, never the token.
import fs from "node:fs";
import path from "node:path";
import { runDeletion, pendingIds } from "./deleter";
import { importArchive, mediaDir } from "./archive";
import type { Store } from "./store";
import type { AppState, Archive, Progress } from "../shared/types";

export const DEFAULT_PORT = 8731;
const VITE_PORT = 5173; // `bun run dev:hmr` proxies the UI's API calls from here

type Options = {
	store: Store;
	viewsDir: string; // built UI (index.html + assets)
	pickFolder: () => Promise<string | null>;
	openExternal: (url: string) => void;
};

export function startServer({ store, viewsDir, pickFolder, openExternal }: Options) {
	// ---- deletion job state (one run at a time) ----
	let job: Progress = { running: false, total: 0, done: 0, ok: 0, fail: 0, waiting: 0, stopping: false, error: null, log: [] };
	let stopRequested = false;
	let savedToken: string | null = null;

	function logLine(s: string) {
		job.log.push(`${new Date().toLocaleTimeString()}  ${s}`);
		if (job.log.length > 100) job.log.shift();
	}

	const idleJob = (): Progress => ({ running: false, total: 0, done: 0, ok: 0, fail: 0, waiting: 0, stopping: false, error: null, log: [] });

	/**
	 * Start a run. Resolves once X has accepted the token (the run then carries on in
	 * the background); rejects with a readable message if logging in fails, in which
	 * case no run is shown, so the UI can just ask for the token again.
	 */
	function startJob(token: string): Promise<void> {
		stopRequested = false;
		job = { ...idleJob(), running: true, total: pendingIds(store).length };
		logLine("Logging in…");
		let loggedIn = false;
		let settle!: { ok: () => void; fail: (msg: string) => void };
		const login = new Promise<void>((ok, fail) => (settle = { ok, fail: (msg) => fail(new Error(msg)) }));
		runDeletion({
			store,
			token,
			shouldStop: () => stopRequested,
			onEvent: (e) => {
				if (e.type === "start") {
					loggedIn = true;
					savedToken = token;
					job.total = e.total;
					logLine(`Logged in. Deleting ${e.total}…`);
					settle.ok();
				}
				if (e.type === "ok") { job.done = e.n; job.ok++; job.waiting = 0; logLine(`deleted ${e.id}`); }
				if (e.type === "fail") { job.done = e.n; job.fail++; job.waiting = 0; logLine(`FAILED ${e.id}: ${e.msg}`); }
				if (e.type === "wait") { job.waiting = e.seconds; logLine(`rate limited — waiting ${e.seconds}s`); }
				if (e.type === "done") logLine(e.stopped ? `Stopped. Deleted ${e.ok}, failed ${e.fail}.` : `Done. Deleted ${e.ok}, failed ${e.fail}.`);
			},
		})
			.catch((err) => {
				const msg = String(err?.message || err);
				if (!loggedIn) {
					const rejected = /failed to log in/i.test(msg);
					if (rejected && token === savedToken) savedToken = null; // expired, or logged out of X since
					job = idleJob();
					settle.fail(rejected ? "X didn't accept that auth_token. Paste the correct one and try again." : `Couldn't log in to X: ${msg}`);
					return;
				}
				job.error = msg;
				logLine(`Error: ${msg}`);
			})
			.finally(() => { job.running = false; job.stopping = false; job.waiting = 0; });
		return login;
	}

	function appState(): AppState {
		const s = store.settings();
		let counts: AppState["counts"];
		try {
			const a: Archive = JSON.parse(fs.readFileSync(store.TWEETS, "utf8"));
			counts = { tweets: a.tweets.length, replies: a.replies.length, retweets: a.retweets.length };
		} catch {}
		return { ...s, imported: !!counts && !!s.archivePath, counts, dataDir: store.dir };
	}

	// ---- helpers ----
	const json = (body: unknown, status = 200) => Response.json(body, { status });
	const notFound = () => new Response("not found", { status: 404 });

	async function readJson(req: Request, limit = 2_000_000) {
		const text = await req.text();
		if (text.length > limit) throw new Error("too large");
		return JSON.parse(text || "null");
	}

	// Serve a file, with Range support so videos can seek.
	async function sendFile(req: Request, base: string, rel: string) {
		base = path.resolve(base); // normalise separators so the escape check below compares like with like
		const file = path.join(base, rel);
		if (!file.startsWith(base + path.sep)) return new Response(null, { status: 403 });
		const f = Bun.file(file);
		if (!(await f.exists())) return notFound();
		const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
		if (range) {
			const size = f.size;
			const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
			const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
			if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
			return new Response(f.slice(start, end + 1), {
				status: 206,
				headers: { "Content-Type": f.type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes" },
			});
		}
		return new Response(f, { headers: { "Accept-Ranges": "bytes" } });
	}

	function serve(port: number) {
		// filled in once the real port is known (port 0 = any free port)
		let hosts = new Set<string>();
		let origins = new Set<string>();

		const server = Bun.serve({
			hostname: "127.0.0.1",
			port,
			idleTimeout: 255, // seconds; /api/delete waits for X to accept the login
			async fetch(req) {
				const url = new URL(req.url);

				// Only this app's own page may talk to the server: the Host check stops
				// DNS-rebinding, the Origin check stops other websites POSTing to localhost.
				if (!hosts.has(req.headers.get("host") || "")) return new Response("forbidden host", { status: 403 });
				const origin = req.headers.get("origin");
				if (req.method === "POST" && origin && !origins.has(origin)) return new Response("forbidden origin", { status: 403 });

				const p = decodeURIComponent(url.pathname);
				try {
					if (p === "/api/state") return json(appState());

					if (p === "/api/pick" && req.method === "POST") return json({ path: await pickFolder() });

					if (p === "/api/import" && req.method === "POST") {
						if (job.running) return json({ error: "Wait for the running deletion to finish first." }, 409);
						const body = await readJson(req, 10_000);
						const archivePath = String(body?.archivePath || "").trim();
						if (!archivePath) return json({ error: "Choose your archive folder first." }, 400);
						const result = importArchive(store, archivePath);
						store.saveSettings({ archivePath });
						return json(result);
					}

					if (p === "/api/tweets") {
						const f = Bun.file(store.TWEETS);
						return (await f.exists()) ? new Response(f, { headers: { "Content-Type": "application/json" } }) : notFound();
					}

					if (p === "/api/selection" && req.method === "GET") return json(store.readIds("selected.json"));
					if (p === "/api/selection" && req.method === "POST") {
						const ids = await readJson(req);
						if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string" && /^\d+$/.test(x))) return json({ error: "bad ids" }, 400);
						const deleted = new Set(store.readIds("deleted.json"));
						const clean = ids.filter((id: string) => !deleted.has(id));
						store.writeIds("selected.json", clean);
						return json({ saved: clean.length });
					}
					if (p === "/api/deleted") return json(store.readIds("deleted.json"));

					if (p === "/api/progress") return json(job);
					if (p === "/api/delete" && req.method === "POST") {
						if (job.running) return json({ error: "A deletion is already running." }, 409);
						const body = await readJson(req, 10_000);
						const token = body?.useSaved ? savedToken ?? "" : String(body?.token || "").trim();
						if (body?.useSaved && !token) return json({ error: "No saved auth_token — paste it again." }, 400);
						if (!/^[A-Za-z0-9]{20,}$/.test(token)) return json({ error: "That doesn't look like an auth_token (should be a long hex string)." }, 400);
						if (!pendingIds(store).length) return json({ error: "Nothing is ticked." }, 400);
						try {
							await startJob(token); // wait for X to accept the login
						} catch (e) {
							return json({ error: (e as Error).message, tokenSaved: !!savedToken }, 401);
						}
						return json({ started: true }, 202);
					}
					if (p === "/api/token") return json({ saved: !!savedToken });
					if (p === "/api/token/forget" && req.method === "POST") { savedToken = null; return json({ saved: false }); }
					if (p === "/api/stop" && req.method === "POST") {
						if (job.running) { stopRequested = true; job.stopping = true; logLine("Stopping after current tweet…"); }
						return json({ stopping: job.running });
					}

					if (p === "/api/open" && req.method === "POST") {
						const target = String((await readJson(req, 10_000))?.url || "");
						if (!/^https:\/\//i.test(target)) return json({ error: "only https links" }, 400);
						openExternal(target);
						return json({ opened: true });
					}
				} catch (e) {
					return json({ error: String((e as Error).message) }, 400);
				}

				if (p.startsWith("/media/")) {
					const archivePath = store.settings().archivePath;
					if (!archivePath) return notFound();
					return sendFile(req, mediaDir(archivePath), p.slice("/media/".length));
				}

				// Everything else is the built UI.
				return sendFile(req, viewsDir, p === "/" ? "index.html" : p.slice(1));
			},
		});
		hosts = new Set([`127.0.0.1:${server.port}`, `localhost:${server.port}`, `127.0.0.1:${VITE_PORT}`, `localhost:${VITE_PORT}`]);
		origins = new Set([...hosts].map((h) => `http://${h}`));
		return server;
	}

	// Prefer the fixed port (the Vite dev proxy expects it); fall back to any free one.
	try {
		return serve(DEFAULT_PORT);
	} catch {
		return serve(0);
	}
}
