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
	mediaOutDir?: string; // where "Download media" saves
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

// ---- "Download media": an account's photos, videos and GIFs ----

export type MediaKind = "photo" | "video" | "gif";

export type MediaTypes = {
	photos: boolean;
	videos: boolean;
	gifs: boolean;
};

// One photo, video or GIF found on the account.
export type MediaItem = {
	name: string; // file name, <date>_<tweet id>_<n>.<ext>; also the item's id
	kind: MediaKind;
	url: string; // the full-size file
	thumb: string;
	tweetUrl: string;
	text: string;
	createdAt: string;
	duration?: number; // seconds, for videos
};

export type MediaState = {
	outDir: string;
};

// Finding the account's media (nothing is saved at this stage).
export type ScanProgress = {
	id: number; // goes up with every scan, so the viewer can start fresh
	running: boolean;
	stopping: boolean;
	stopped: boolean;
	username: string; // empty until X has accepted the token and found the account
	mediaPosts: number; // how many media posts X says the account has
	posts: number; // media posts scanned so far
	waiting: number; // seconds left on a rate-limit wait
	error: string | null;
};

// Saving the ticked items.
export type DownloadProgress = {
	running: boolean;
	stopping: boolean;
	stopped: boolean;
	dir: string; // the folder this run saves into
	total: number;
	downloaded: number;
	skipped: number; // already in the folder
	failed: number;
	bytes: number;
	error: string | null;
	log: string[];
};
