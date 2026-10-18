// Shared deletion logic used by both the desktop app (server.ts) and
// delete-selected.ts (command line).
//
// Successes are collected in memory and flushed to deleted.json / selected.json
// about once a second (and always at the end), so stopping or crashing mid-run
// loses at most the last second of progress and a re-run resumes.
import fs from "node:fs";
import Emusks from "emusks";
import type { Archive } from "../shared/types";
import type { Store } from "./store";

const WORKERS = 3; // deletes in flight at once
const DELAY_MS = 300; // pause after each delete, per worker
const FLUSH_MS = 1000;

export type DeleteEvent =
	| { type: "start"; total: number }
	| { type: "ok"; id: string; n: number }
	| { type: "fail"; id: string; n: number; msg: string }
	| { type: "wait"; seconds: number }
	| { type: "done"; ok: number; fail: number; stopped: boolean };

// The bits of the emusks client the deleter uses (lets tests pass a fake).
export type DeleteClient = {
	login(token: string): Promise<unknown>;
	tweets: {
		delete(id: string): Promise<unknown>;
		get(id: string): Promise<unknown>;
		unretweet(id: string): Promise<unknown>;
	};
	onResponse?: (info: { name: string; status: number; headers: Record<string, string | string[] | undefined> }) => void;
};

export function loadArchive(store: Store) {
	const { tweets, replies, retweets }: Archive = JSON.parse(fs.readFileSync(store.TWEETS, "utf8"));
	return {
		byId: new Map([...tweets, ...replies, ...retweets].map((t) => [t.id, t])),
		replyIds: new Set(replies.map((t) => t.id)),
		rtIds: new Set(retweets.map((t) => t.id)),
	};
}

// Ids of every post currently loaded (archive or "Load from X").
export function loadedIds(store: Store) {
	try {
		const a: Archive = JSON.parse(fs.readFileSync(store.TWEETS, "utf8"));
		return new Set([...a.tweets, ...a.replies, ...a.retweets].map((t) => t.id));
	} catch {
		return new Set<string>();
	}
}

// The pending queue: ticked ids that haven't been deleted yet. Only posts that are
// actually loaded count, so a tick left over from another account's posts can
// never be sent to X.
export function pendingIds(store: Store) {
	const deleted = new Set(store.readIds("deleted.json"));
	const loaded = loadedIds(store);
	return store.readIds("selected.json").filter((id) => !deleted.has(id) && loaded.has(id));
}

/**
 * Delete every pending id, a few at a time. `onEvent` receives progress events
 * (see DeleteEvent). `shouldStop()` is polled between deletes (and during
 * rate-limit waits).
 */
export async function runDeletion({
	store,
	token,
	onEvent = () => {},
	shouldStop = () => false,
	client = new Emusks() as unknown as DeleteClient,
	workers = WORKERS,
	delayMs = DELAY_MS,
}: {
	store: Store;
	token: string;
	onEvent?: (e: DeleteEvent) => void;
	shouldStop?: () => boolean;
	client?: DeleteClient;
	workers?: number;
	delayMs?: number;
}) {
	const { rtIds } = loadArchive(store);
	const queue = pendingIds(store);

	await client.login(token); // throws on a bad token

	// sleep in ≤1s steps so a stop request takes effect quickly
	const sleep = async (ms: number) => {
		for (let left = ms; left > 0 && !shouldStop(); left -= 1000) {
			await new Promise((r) => setTimeout(r, Math.min(1000, left)));
		}
	};

	// ---- saving progress (batched) ----
	const deleted = new Set(store.readIds("deleted.json"));
	let unsaved = 0;
	function flush() {
		if (!unsaved) return;
		unsaved = 0;
		store.writeIds("deleted.json", [...deleted]);
		// re-read selected.json so ticks made in the viewer during the run are kept
		store.writeIds("selected.json", store.readIds("selected.json").filter((x) => !deleted.has(x)));
	}
	const flushTimer = setInterval(flush, FLUSH_MS);

	// ---- rate limits: one shared pause for every worker ----
	// X sends the window's remaining count and reset time with each response;
	// when the delete budget runs out, everyone waits until the reset.
	let pausedUntil = 0;
	let resetAt = 0; // epoch ms from the last x-rate-limit-reset header
	const header = (h: Record<string, string | string[] | undefined>, name: string) => [h[name] ?? h[name.toLowerCase()]].flat()[0];
	client.onResponse = ({ name, headers }) => {
		if (name !== "DeleteTweet" && name !== "DeleteRetweet") return;
		const reset = Number(header(headers, "x-rate-limit-reset"));
		if (reset) resetAt = reset * 1000;
		if (header(headers, "x-rate-limit-remaining") === "0" && resetAt > Date.now()) pause(resetAt - Date.now());
	};
	function pause(ms: number) {
		const until = Date.now() + ms;
		if (until <= pausedUntil) return;
		pausedUntil = until;
		onEvent({ type: "wait", seconds: Math.ceil(ms / 1000) });
	}
	const waitIfPaused = () => sleep(pausedUntil - Date.now());

	// emusks only throws when X returns errors with no data at all; a response that
	// carries both is passed through. Treat any reported error as a failure so a
	// delete never counts as done unless X said nothing went wrong.
	const strict = <T>(res: T) => {
		const errors = (res as { errors?: { message: string }[] })?.errors;
		if (errors?.length) throw new Error(errors.map((e) => e.message).join(", "));
		return res;
	};
	const deleteTweet = async (id: string) => strict(await client.tweets.delete(id));

	// Retweets: the archive only has the retweet's own id. Try deleting that first;
	// if X refuses, look up the original tweet and undo the retweet on it instead.
	async function removeRetweet(id: string) {
		try {
			return await deleteTweet(id);
		} catch (err) {
			if (isRateLimit(err)) throw err;
			const t = await client.tweets.get(id);
			const src = (t as { retweeting?: { id?: string } })?.retweeting?.id;
			if (!src) throw err;
			return strict(await client.tweets.unretweet(src));
		}
	}

	onEvent({ type: "start", total: queue.length });
	let ok = 0, fail = 0, n = 0, next = 0;

	async function deleteOne(id: string) {
		let limited = 0;
		for (let attempt = 1; ; ) {
			await waitIfPaused();
			if (shouldStop()) return false;
			try {
				if (rtIds.has(id)) await removeRetweet(id);
				else await deleteTweet(id);
				deleted.add(id);
				unsaved++;
				ok++;
				onEvent({ type: "ok", id, n: ++n });
				return true;
			} catch (err) {
				const msg = String((err as Error)?.message || err);
				// rate limited: wait for the window to reset (or back off if X didn't say when)
				if (isRateLimit(err) && ++limited <= 5) {
					pause(resetAt > Date.now() ? resetAt - Date.now() + 1000 : 60_000 * limited);
					continue;
				}
				// anything else: give up after 3 tries
				if (attempt++ < 3 && !shouldStop()) { await sleep(5000); continue; }
				fail++;
				onEvent({ type: "fail", id, n: ++n, msg });
				return true;
			}
		}
	}

	async function worker() {
		while (next < queue.length && !shouldStop()) {
			const id = queue[next++];
			if (!(await deleteOne(id))) return;
			await sleep(delayMs);
		}
	}

	try {
		await Promise.all(Array.from({ length: Math.max(1, workers) }, worker));
	} finally {
		clearInterval(flushTimer);
		flush();
	}
	onEvent({ type: "done", ok, fail, stopped: shouldStop() });
	return { ok, fail };
}

function isRateLimit(err: unknown) {
	const e = err as { status?: number; message?: string };
	return e?.status === 429 || /429|rate.?limit/i.test(String(e?.message || err));
}
