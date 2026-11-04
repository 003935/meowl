// Two steps: scanMedia pages through an account's Media tab with your auth_token
// and reports what's there; saveFiles writes the chosen items to a folder.
// downloadMedia does both, for the command line.
//
// Files are named <date>_<tweet id>_<n>.<ext> and only appear under that name once
// complete, so a rerun skips what's already there. The auth token only goes to X;
// the media files come from X's public CDN without it.
//
// X only pages back through roughly the newest ~3,200 posts this way.
import fs from "node:fs";
import path from "node:path";
import Emusks from "emusks";
import type { MediaItem, MediaTypes } from "../shared/types";

const CONCURRENCY = 4;
const ATTEMPTS = 3;

export type ScanEvent =
	| { type: "login" }
	| { type: "start"; username: string; mediaPosts: number }
	| { type: "page"; posts: number; found: number }
	| { type: "wait"; seconds: number }
	| { type: "done"; posts: number; found: number; stopped: boolean };

export type SaveEvent =
	| { type: "file"; name: string; bytes: number }
	| { type: "skip"; name: string }
	| { type: "fail"; name: string; msg: string };

// The bits of emusks' parsed tweet this uses.
type XTweet = {
	id: string;
	tombstone?: boolean;
	promoted?: boolean;
	text?: string;
	created_at?: string;
	user?: { id?: string } | null;
	media?: { type?: string; media_url_https?: string; video_info?: { duration_millis?: number; variants?: { content_type?: string; bitrate?: number; url: string }[] } }[];
	retweeting?: XTweet | null;
};

export type MediaClient = {
	login(token: string): Promise<unknown>;
	users: {
		getByUsername(username: string): Promise<{ id?: string; username?: string; stats?: { media?: number } } | null>;
		userMedia(userId: string, opts?: { count?: number; cursor?: string }): Promise<{ tweets: XTweet[]; nextCursor: string | null }>;
	};
	onResponse?: (info: { name: string; status: number; headers: Record<string, string | string[] | undefined> }) => void;
};

/** "@name", "name" or a profile link → the username, or null if it isn't one. */
export function parseUsername(input: string): string | null {
	const s = input.trim();
	const m = s.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/@?(\w{1,15})(?:[/?#].*)?$/i) ?? s.match(/^@?(\w{1,15})$/);
	return m ? m[1] : null;
}

const isCdn = (url: string) => /^https:\/\/([a-z0-9-]+\.)*twimg\.com\//i.test(url);

/** The media in one tweet: photos at original size, videos and GIFs as the best mp4. */
export function itemsOf(t: XTweet, username: string): MediaItem[] {
	const time = new Date(t.created_at ?? "").getTime();
	const date = Number.isNaN(time) ? "undated" : new Date(time).toISOString().slice(0, 10);
	const shared = { tweetUrl: `https://x.com/${username}/status/${t.id}`, text: t.text ?? "", createdAt: t.created_at ?? "" };
	return (t.media ?? []).flatMap((m, i): MediaItem[] => {
		const stem = `${date}_${t.id}_${i + 1}`;
		const image = m.media_url_https && isCdn(m.media_url_https) ? m.media_url_https : "";
		const thumb = image && `${image}?name=small`;
		if (m.type === "video" || m.type === "animated_gif") {
			const best = (m.video_info?.variants ?? [])
				.filter((v) => v.content_type === "video/mp4")
				.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
			if (!best || !isCdn(best.url)) return [];
			if (m.type === "animated_gif") return [{ ...shared, name: `${stem}.mp4`, kind: "gif", url: best.url, thumb }];
			const ms = m.video_info?.duration_millis;
			return [{ ...shared, name: `${stem}.mp4`, kind: "video", url: best.url, thumb, ...(ms ? { duration: ms / 1000 } : {}) }];
		}
		if (!image) return [];
		const ext = image.match(/\.(\w+)$/)?.[1] ?? "jpg";
		return [{ ...shared, name: `${stem}.${ext}`, kind: "photo", url: `${image}?name=orig`, thumb }];
	});
}

/** Page through the account's media, handing over each page's items as they arrive. */
export async function scanMedia({
	username,
	token,
	onItems,
	onEvent = () => {},
	shouldStop = () => false,
	client = new Emusks() as unknown as MediaClient,
}: {
	username: string;
	token: string;
	onItems: (items: MediaItem[], username: string) => void | Promise<void>;
	onEvent?: (e: ScanEvent) => void;
	shouldStop?: () => boolean;
	client?: MediaClient;
}) {
	await client.login(token); // throws on a bad token
	onEvent({ type: "login" });

	const user = await client.users.getByUsername(username).catch((err) => {
		if (/couldn't get user/i.test(String(err?.message || err))) return null;
		throw err;
	});
	if (!user?.id) throw new Error(`Couldn't find @${username}. Check the spelling; the account may also be suspended or have blocked you.`);
	const handle = user.username ?? username;

	const sleep = async (ms: number) => {
		for (let left = ms; left > 0 && !shouldStop(); left -= 1000) {
			await new Promise((r) => setTimeout(r, Math.min(1000, left)));
		}
	};

	let resetAt = 0; // epoch ms from the last x-rate-limit-reset header
	let remaining = Infinity; // requests left in this window, from x-rate-limit-remaining
	client.onResponse = ({ name, headers }) => {
		if (name !== "UserMedia") return;
		const h = (k: string) => [headers[k] ?? headers[k.toLowerCase()]].flat()[0];
		const reset = Number(h("x-rate-limit-reset"));
		if (reset) resetAt = reset * 1000;
		const left = h("x-rate-limit-remaining");
		if (left != null && left !== "") remaining = Number(left);
	};

	const seen = new Set<string>();
	let found = 0;
	let cursor: string | undefined;
	let emptyPages = 0;
	onEvent({ type: "start", username: handle, mediaPosts: Number(user.stats?.media) || 0 });
	while (!shouldStop()) {
		let page: Awaited<ReturnType<MediaClient["users"]["userMedia"]>>;
		for (let limited = 0; ; ) {
			try {
				page = await client.users.userMedia(user.id, { count: 100, cursor });
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

		const items: MediaItem[] = [];
		let added = 0;
		for (const t of page!.tweets) {
			if (seen.has(t.id)) continue;
			// only the account's own posts, never ads or what it reposted
			if (t.tombstone || t.promoted || t.retweeting || t.user?.id !== user.id) continue;
			seen.add(t.id);
			added++;
			items.push(...itemsOf(t, handle));
		}
		found += items.length;
		onEvent({ type: "page", posts: seen.size, found });
		await onItems(items, handle);

		// X signals the end with no cursor, or by handing back pages with nothing new
		if (!page!.nextCursor || page!.nextCursor === cursor) break;
		emptyPages = added ? 0 : emptyPages + 1;
		if (emptyPages >= 3) break;
		cursor = page!.nextCursor;
		// out of requests for this window: wait for the reset instead of hitting a 429
		if (remaining <= 0 && resetAt > Date.now()) {
			const ms = resetAt - Date.now() + 1000;
			onEvent({ type: "wait", seconds: Math.ceil(ms / 1000) });
			await sleep(ms);
			remaining = Infinity;
		}
	}

	onEvent({ type: "done", posts: seen.size, found, stopped: shouldStop() });
	return { username: handle, posts: seen.size, found, stopped: shouldStop() };
}

/** Save items to dir, a few at a time; ones already there are skipped. */
export async function saveFiles({
	items,
	dir,
	onEvent = () => {},
	shouldStop = () => false,
	fetchFile = fetch,
}: {
	items: Pick<MediaItem, "url" | "name">[];
	dir: string;
	onEvent?: (e: SaveEvent) => void;
	shouldStop?: () => boolean;
	fetchFile?: (url: string) => Promise<Response>;
}) {
	fs.mkdirSync(dir, { recursive: true });
	let downloaded = 0, skipped = 0, failed = 0;

	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	async function saveFile(file: Pick<MediaItem, "url" | "name">) {
		const final = path.join(dir, file.name);
		if (fs.existsSync(final)) {
			skipped++;
			onEvent({ type: "skip", name: file.name });
			return;
		}
		const part = `${final}.part`;
		for (let attempt = 1; ; attempt++) {
			try {
				const r = await fetchFile(file.url);
				if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
				const bytes = await Bun.write(part, r);
				fs.renameSync(part, final);
				downloaded++;
				onEvent({ type: "file", name: file.name, bytes });
				return;
			} catch (err) {
				fs.rmSync(part, { force: true });
				const status = (err as { status?: number }).status ?? 0;
				const gone = status >= 400 && status < 500 && status !== 429;
				if (gone || attempt >= ATTEMPTS || shouldStop()) {
					failed++;
					onEvent({ type: "fail", name: file.name, msg: String((err as Error).message || err) });
					return;
				}
				await sleep(1000 * attempt);
			}
		}
	}

	let next = 0;
	const worker = async () => {
		while (next < items.length && !shouldStop()) await saveFile(items[next++]);
	};
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
	return { downloaded, skipped, failed };
}

/** Scan and save everything to <outDir>/<username>/; resumable, and stopping keeps what's saved. */
export async function downloadMedia({
	username,
	token,
	outDir,
	types = { photos: true, videos: true, gifs: true },
	onEvent = () => {},
	shouldStop = () => false,
	client,
	fetchFile,
}: {
	username: string;
	token: string;
	outDir: string;
	types?: MediaTypes;
	onEvent?: (e: ScanEvent | SaveEvent) => void;
	shouldStop?: () => boolean;
	client?: MediaClient;
	fetchFile?: (url: string) => Promise<Response>;
}) {
	const wanted = { photo: types.photos, video: types.videos, gif: types.gifs };
	const totals = { downloaded: 0, skipped: 0, failed: 0 };
	const { stopped } = await scanMedia({
		username,
		token,
		onEvent,
		shouldStop,
		...(client && { client }),
		onItems: async (items, handle) => {
			const r = await saveFiles({
				items: items.filter((i) => wanted[i.kind]),
				dir: path.join(outDir, handle),
				onEvent,
				shouldStop,
				...(fetchFile && { fetchFile }),
			});
			totals.downloaded += r.downloaded;
			totals.skipped += r.skipped;
			totals.failed += r.failed;
		},
	});
	return { ...totals, stopped };
}
