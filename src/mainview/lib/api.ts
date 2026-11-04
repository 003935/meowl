import type { AppState, Archive, DownloadProgress, FetchProgress, ImportResult, MediaItem, MediaState, Progress, ScanProgress } from "../../shared/types";

async function call<T>(path: string, init?: { body?: unknown }): Promise<T> {
	const r = await fetch(path, init ? {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	} : undefined);
	const body = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error(body?.error || `${path} failed (${r.status})`);
	return body as T;
}

export const api = {
	state: () => call<AppState>("/api/state"),
	pickFolder: () => call<{ path: string | null }>("/api/pick", { body: {} }),
	importArchive: (archivePath: string) => call<ImportResult>("/api/import", { body: { archivePath } }),
	tweets: () => call<Archive>("/api/tweets"),
	selection: () => call<string[]>("/api/selection"),
	saveSelection: (ids: string[]) => call<{ saved: number }>("/api/selection", { body: ids }),
	deleted: () => call<string[]>("/api/deleted"),
	progress: () => call<Progress>("/api/progress"),
	/** token = null uses the one remembered from earlier this session */
	startDelete: (token: string | null) => call<{ started: boolean }>("/api/delete", { body: token === null ? { useSaved: true } : { token } }),
	tokenSaved: () => call<{ saved: boolean }>("/api/token").then((r) => r.saved),
	forgetToken: () => call<{ saved: boolean }>("/api/token/forget", { body: {} }),
	stop: () => call<{ stopping: boolean }>("/api/stop", { body: {} }),
	/** Load your posts from X's timeline instead of an archive; token = null uses the remembered one */
	startFetch: (token: string | null) => call<{ started: boolean }>("/api/fetch", { body: token === null ? { useSaved: true } : { token } }),
	fetchProgress: () => call<FetchProgress>("/api/fetch/progress"),
	stopFetch: () => call<{ stopping: boolean }>("/api/fetch/stop", { body: {} }),
	// Links open in the system browser, not inside the app window.
	openExternal: (url: string) => call("/api/open", { body: { url } }).catch(() => window.open(url, "_blank", "noopener")),
	// "Download media": an account's photos, videos and GIFs
	media: {
		state: () => call<MediaState>("/api/media/state"),
		pickFolder: () => call<{ path: string | null }>("/api/media/pick", { body: {} }),
		/** token = null uses the one remembered from earlier this session */
		startScan: (username: string, token: string | null) =>
			call<{ started: boolean }>("/api/media/scan", { body: { username, ...(token === null ? { useSaved: true } : { token }) } }),
		scanProgress: () => call<ScanProgress>("/api/media/scan/progress"),
		stopScan: () => call<{ stopping: boolean }>("/api/media/scan/stop", { body: {} }),
		items: (from: number) => call<MediaItem[]>(`/api/media/items?from=${from}`),
		saved: () => call<string[]>("/api/media/saved"),
		startDownload: (names: string[]) => call<{ started: boolean }>("/api/media/download", { body: names }),
		downloadProgress: () => call<DownloadProgress>("/api/media/download/progress"),
		stopDownload: () => call<{ stopping: boolean }>("/api/media/download/stop", { body: {} }),
		reveal: () => call<{ revealed: boolean }>("/api/media/reveal", { body: {} }),
	},
};

// archive media are files in the archive folder; posts loaded from X link to X's own media
export const mediaUrl = (file: string) => (/^https:\/\//.test(file) ? file : `/media/${encodeURIComponent(file)}`);
