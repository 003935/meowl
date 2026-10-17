import type { AppState, Archive, ImportResult, Progress } from "../../shared/types";

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
	importArchive: (archivePath: string, cutoff: string) => call<ImportResult>("/api/import", { body: { archivePath, cutoff } }),
	tweets: () => call<Archive>("/api/tweets"),
	selection: () => call<string[]>("/api/selection"),
	saveSelection: (ids: string[]) => call<{ saved: number }>("/api/selection", { body: ids }),
	deleted: () => call<string[]>("/api/deleted"),
	progress: () => call<Progress>("/api/progress"),
	startDelete: (token: string) => call<{ started: boolean }>("/api/delete", { body: { token } }),
	stop: () => call<{ stopping: boolean }>("/api/stop", { body: {} }),
	// Links open in the system browser, not inside the app window.
	openExternal: (url: string) => call("/api/open", { body: { url } }).catch(() => window.open(url, "_blank", "noopener")),
};

export const mediaUrl = (file: string) => `/media/${encodeURIComponent(file)}`;
