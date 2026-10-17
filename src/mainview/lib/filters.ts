import type { Tweet } from "../../shared/types";

export type Presence = "all" | "only" | "exclude";

// Mirrors X's advanced search, limited to what the archive records.
export type Filters = {
	allWords: string;
	exactPhrase: string;
	anyWords: string;
	noneWords: string;
	hashtags: string;
	fromAccounts: string;
	toAccounts: string;
	mentioning: string;
	links: Presence;
	media: Presence;
	minLikes: string;
	minReposts: string;
	since: string; // YYYY-MM-DD, inclusive
	until: string; // YYYY-MM-DD, inclusive
};

export const EMPTY_FILTERS: Filters = {
	allWords: "",
	exactPhrase: "",
	anyWords: "",
	noneWords: "",
	hashtags: "",
	fromAccounts: "",
	toAccounts: "",
	mentioning: "",
	links: "all",
	media: "all",
	minLikes: "",
	minReposts: "",
	since: "",
	until: "",
};

/** How many fields differ from the defaults (for the badge on the Filters button). */
export const activeFilterCount = (f: Filters) =>
	(Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).filter((k) => f[k].trim() !== EMPTY_FILTERS[k]).length;

// "cats, #Dogs @x" → ["cats", "dogs", "x"]
const words = (s: string) =>
	s.toLowerCase().split(/[\s,]+/).map((w) => w.replace(/^[#@]+/, "")).filter(Boolean);

const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// date inputs are "YYYY-MM-DD"; interpret in local time to match the dates shown
const dayStart = (d: string) => new Date(`${d}T00:00:00`).getTime();

/**
 * Build a predicate for `f` plus the header's quick search. `username` is the
 * archive owner's handle, used for "From these accounts" on their own posts.
 */
export function makeMatcher(f: Filters, quick: string, username?: string) {
	const all = words(f.allWords);
	const any = words(f.anyWords);
	const none = words(f.noneWords);
	const tags = words(f.hashtags);
	const from = new Set(words(f.fromAccounts));
	const to = new Set(words(f.toAccounts));
	const mentioning = words(f.mentioning);
	const phrase = f.exactPhrase.trim().toLowerCase();
	const q = quick.trim().toLowerCase();
	const minLikes = Number(f.minLikes) || 0;
	const minReposts = Number(f.minReposts) || 0;
	const lo = f.since ? dayStart(f.since) : -Infinity;
	const hi = f.until ? dayStart(f.until) + 86_400_000 : Infinity;
	const me = username?.toLowerCase();

	return (t: Tweet) => {
		if (t.ts < lo || t.ts >= hi) return false;
		if (t.likes < minLikes || t.retweets_count < minReposts) return false;
		if (f.links === "only" ? !t.urls.length : f.links === "exclude" && t.urls.length) return false;
		if (f.media === "only" ? !t.media.length : f.media === "exclude" && t.media.length) return false;

		const text = unescape(t.text).toLowerCase();
		if (q && !text.includes(q)) return false;
		if (phrase && !text.includes(phrase)) return false;

		const tokens: string[] = text.match(/[#@]?[\p{L}\p{N}_']+/gu) ?? [];
		const plain = new Set(tokens.map((w) => w.replace(/^[#@]/, "")));
		if (!all.every((w) => plain.has(w))) return false;
		if (any.length && !any.some((w) => plain.has(w))) return false;
		if (none.some((w) => plain.has(w))) return false;
		if (tags.length && !tags.every((w) => tokens.includes(`#${w}`))) return false;
		if (mentioning.length && !mentioning.some((w) => tokens.includes(`@${w}`))) return false;

		// a retweet is "from" the account it reposted; everything else is the archive owner's
		const author = (t.rt_of ?? me)?.toLowerCase();
		if (from.size && !(author && from.has(author))) return false;
		if (to.size && !(t.reply_to && to.has(t.reply_to.toLowerCase()))) return false;
		return true;
	};
}
