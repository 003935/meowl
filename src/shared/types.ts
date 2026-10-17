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
	cutoff: string; // YYYY-MM-DD; only tweets strictly before this are listed
};

export type AppState = Settings & {
	imported: boolean;
	dataDir: string;
	counts?: Record<Kind, number>;
};

export type ImportResult = {
	total: number;
	afterCutoff: number;
	counts: Record<Kind, number>;
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
