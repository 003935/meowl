// Shapes shared by the Bun main process and the React UI.

export type Kind = "tweets" | "replies" | "retweets";

export type Tweet = {
	id: string;
	created_at: string;
	ts: number;
	text: string;
	reply_to?: string;
	rt_of?: string;
	likes: number;
	retweets_count: number;
	urls: { url: string; expanded?: string; display?: string }[];
	media: string[];
};

export type Archive = Record<Kind, Tweet[]>;

export type Settings = {
	archivePath?: string;
	// "x" = loaded from your timeline with an auth_token instead of an archive
	source?: "archive" | "x";
	username?: string;
};

export type AppState = Settings & {
	imported: boolean;
	dataDir: string;
	counts?: Record<Kind, number>;
};

export type ImportResult = {
	total: number;
	counts: Record<Kind, number>;
};

// "Load from X" (timeline fetch) progress
export type FetchProgress = {
	running: boolean;
	stopping: boolean;
	fetched: number;
	waiting: number; // seconds left on a rate-limit wait
	username: string;
	error: string | null;
	counts: Record<Kind, number> | null; // set when finished
};

export type Progress = {
	running: boolean;
	total: number;
	done: number;
	ok: number;
	fail: number;
	waiting: number;
	stopping: boolean;
	error: string | null;
	log: string[];
};
