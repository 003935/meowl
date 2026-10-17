// Tiny local server: serves the archive folder, persists the delete selection,
// and runs deletions when you press the button on the site.
//   GET  /api/selection  -> ticked ids (viewer/selected.json)
//   POST /api/selection  <- ticked ids
//   GET  /api/deleted    -> ids already deleted (viewer/deleted.json)
//   POST /api/delete     <- {token}  start deleting every ticked id
//   POST /api/stop       stop the running deletion after the current tweet
//   GET  /api/progress   -> state of the current/last deletion run
//
// The auth token is only held in memory for the duration of a run; it is never
// written to disk or sent anywhere except X.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDeletion, pendingIds, readIds, SELECTED, DELETED } from "./deleter.mjs";
import { ARCHIVE } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.join(ARCHIVE, "data", "tweets_media");
const PORT = 8731;
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime",
};

// ---- deletion job state (one run at a time) ----
let job = { running: false, total: 0, done: 0, ok: 0, fail: 0, waiting: 0, stopping: false, error: null, log: [] };
let stopRequested = false;

function logLine(s) {
  job.log.push(`${new Date().toLocaleTimeString()}  ${s}`);
  if (job.log.length > 100) job.log.shift();
}

function startJob(token) {
  stopRequested = false;
  job = { running: true, total: pendingIds().length, done: 0, ok: 0, fail: 0, waiting: 0, stopping: false, error: null, log: [] };
  logLine(`Logging in…`);
  runDeletion({
    token,
    shouldStop: () => stopRequested,
    onEvent: (e) => {
      if (e.type === "start") { job.total = e.total; logLine(`Logged in. Deleting ${e.total}…`); }
      if (e.type === "ok") { job.done = e.n; job.ok++; job.waiting = 0; logLine(`deleted ${e.id}`); }
      if (e.type === "fail") { job.done = e.n; job.fail++; job.waiting = 0; logLine(`FAILED ${e.id}: ${e.msg}`); }
      if (e.type === "wait") { job.waiting = e.seconds; logLine(`rate limited — waiting ${e.seconds}s`); }
      if (e.type === "done") logLine(e.stopped ? `Stopped. Deleted ${e.ok}, failed ${e.fail}.` : `Done. Deleted ${e.ok}, failed ${e.fail}.`);
    },
  })
    .catch((err) => {
      const msg = String(err?.message || err);
      job.error = /failed to log in/i.test(msg)
        ? "X rejected that auth_token — copy it again from your x.com cookies (it changes when you log out)."
        : msg;
      logLine(`Error: ${job.error}`);
    })
    .finally(() => { job.running = false; job.stopping = false; job.waiting = 0; });
}

// ---- helpers ----
const json = (res, code, body) => res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify(body));

function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > limit) { reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(JSON.parse(body || "null")); } catch (e) { reject(e); } });
  });
}

function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end("not found"); return; }
    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
    const range = req.headers.range; // videos need range support to seek
    if (range) {
      const [s, e] = range.replace("bytes=", "").split("-");
      const start = Number(s), end = e ? Number(e) : st.size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${st.size}`,
        "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes" });
      fs.createReadStream(file).pipe(res);
    }
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Only this page may trigger writes/deletes — blocks other websites from
  // POSTing to localhost behind your back.
  if (req.method === "POST" && req.headers.origin && !ALLOWED_ORIGINS.has(req.headers.origin)) {
    res.writeHead(403).end("forbidden origin");
    return;
  }

  try {
    if (url.pathname === "/api/selection" && req.method === "GET") return json(res, 200, readIds(SELECTED));
    if (url.pathname === "/api/selection" && req.method === "POST") {
      const ids = await readBody(req);
      if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string" && /^\d+$/.test(x))) return json(res, 400, { error: "bad ids" });
      const deleted = new Set(readIds(DELETED));
      const clean = ids.filter((id) => !deleted.has(id));
      fs.writeFileSync(SELECTED, JSON.stringify(clean));
      return json(res, 200, { saved: clean.length });
    }
    if (url.pathname === "/api/deleted") return json(res, 200, readIds(DELETED));

    if (url.pathname === "/api/progress") return json(res, 200, job);
    if (url.pathname === "/api/delete" && req.method === "POST") {
      if (job.running) return json(res, 409, { error: "A deletion is already running." });
      const body = await readBody(req, 10_000);
      const token = String(body?.token || "").trim();
      if (!/^[A-Za-z0-9]{20,}$/.test(token)) return json(res, 400, { error: "That doesn't look like an auth_token (should be a long hex string)." });
      if (!pendingIds().length) return json(res, 400, { error: "Nothing is ticked." });
      startJob(token);
      return json(res, 202, { started: true });
    }
    if (url.pathname === "/api/stop" && req.method === "POST") {
      if (job.running) { stopRequested = true; job.stopping = true; logLine("Stopping after current tweet…"); }
      return json(res, 200, { stopping: job.running });
    }
  } catch (e) {
    return json(res, 400, { error: String(e.message) });
  }

  // /viewer/*             -> this app's index.html + tweets.json
  // /data/tweets_media/*  -> media files inside the archive
  if (url.pathname === "/" || url.pathname === "/viewer") { res.writeHead(302, { Location: "/viewer/" }).end(); return; }
  const p = decodeURIComponent(url.pathname);
  let base, rel;
  if (p.startsWith("/viewer/")) {
    base = __dirname; rel = p.slice("/viewer/".length) || "index.html";
    if (!["index.html", "tweets.json"].includes(rel)) { res.writeHead(404).end("not found"); return; }
  } else if (p.startsWith("/data/tweets_media/")) {
    base = MEDIA_DIR; rel = p.slice("/data/tweets_media/".length);
  } else { res.writeHead(404).end("not found"); return; }
  const file = path.join(base, rel);
  if (!file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
  sendFile(req, res, file);
}).listen(PORT, "127.0.0.1", () => console.log(`Viewer: http://127.0.0.1:${PORT}/viewer/`));
