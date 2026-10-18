import { stemmer } from "stemmer";
import type { Tweet } from "../../shared/types";

export type Presence = "all" | "only" | "exclude";

// Loosely modelled on X's advanced search, limited to what the archive records.
export type Filters = {
	include: string; // comma-separated words / phrases / #tags / @names; at least one must appear
	exclude: string; // comma-separated; none may appear
	links: Presence;
	media: Presence;
	minLikes: string;
	maxLikes: string; // "" = no upper limit
	minReposts: string;
	maxReposts: string;
	since: string; // YYYY-MM-DD, inclusive
	until: string; // YYYY-MM-DD, inclusive
};

export const EMPTY_FILTERS: Filters = {
	include: "",
	exclude: "",
	links: "all",
	media: "all",
	minLikes: "",
	maxLikes: "",
	minReposts: "",
	maxReposts: "",
	since: "",
	until: "",
};

/** How many fields differ from the defaults (for the badge on the Filters button). */
export const activeFilterCount = (f: Filters) =>
	(Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).filter((k) => f[k].trim() !== EMPTY_FILTERS[k]).length;

// 'cats, happy hour, "#Dogs"' → ["cats", "happy hour", "#dogs"]: comma-separated, quotes optional
const terms = (s: string) =>
	s.toLowerCase().split(",").map((t) => t.trim().replace(/^"(.*)"$/, "$1").trim()).filter(Boolean);

const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// lowercase and strip accents, so "cafe" finds "Café"
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/’/g, "'").toLowerCase();

const WORD = /[#@]?[\p{L}\p{N}_']+/gu;

// Each tweet's words for the quick search, worked out once per tweet.
// "stems" are base forms (Porter stemmer): "cats" → "cat", "running" → "run".
type Words = { tokens: Set<string>; stems: Set<string> };
const wordCache = new WeakMap<Tweet, Words>();
function wordsOf(t: Tweet): Words {
	let w = wordCache.get(t);
	if (!w) {
		const tokens = fold(unescape(t.text)).match(WORD) ?? [];
		w = { tokens: new Set(tokens), stems: new Set(tokens.map((x) => stemmer(x.replace(/^[#@]/, "")))) };
		wordCache.set(t, w);
	}
	return w;
}

// One quick-search word → a test on a tweet's words:
//   "cats"  same base word ("cat", "cats"; not "scat" or "category")
//   "@name" / "#tag"  that mention or tag only
function quickTerm(raw: string): ((w: Words) => boolean)[] {
	return (raw.match(WORD) ?? []).map((p) => {
		if (/^[#@]/.test(p)) return (w) => w.tokens.has(p);
		const stem = stemmer(p);
		return (w) => w.stems.has(stem);
	});
}

// date inputs are "YYYY-MM-DD"; interpret in local time to match the dates shown
const dayStart = (d: string) => new Date(`${d}T00:00:00`).getTime();

/** Build a predicate for `f` plus the header's quick search. */
export function makeMatcher(f: Filters, quick: string) {
	const include = terms(f.include);
	const exclude = terms(f.exclude);
	// quick search: every word must appear, in any order, ignoring accents (see quickTerm)
	const q = fold(quick).split(/\s+/).flatMap(quickTerm);
	const minLikes = Number(f.minLikes) || 0;
	const minReposts = Number(f.minReposts) || 0;
	const maxLikes = f.maxLikes === "" ? Infinity : Number(f.maxLikes);
	const maxReposts = f.maxReposts === "" ? Infinity : Number(f.maxReposts);
	const lo = f.since ? dayStart(f.since) : -Infinity;
	const hi = f.until ? dayStart(f.until) + 86_400_000 : Infinity;

	return (t: Tweet) => {
		if (t.ts < lo || t.ts >= hi) return false;
		if (t.likes < minLikes || t.likes > maxLikes) return false;
		if (t.retweets_count < minReposts || t.retweets_count > maxReposts) return false;
		if (f.links === "only" ? !t.urls.length : f.links === "exclude" && t.urls.length) return false;
		if (f.media === "only" ? !t.media.length : f.media === "exclude" && t.media.length) return false;

		const text = unescape(t.text).toLowerCase();
		if (q.length) {
			const words = wordsOf(t);
			if (!q.every((test) => test(words))) return false;
		}

		const tokens: string[] = text.match(/[#@]?[\p{L}\p{N}_']+/gu) ?? [];
		const plain = new Set(tokens.map((w) => w.replace(/^[#@]/, "")));
		// a phrase matches as typed, "#tag" / "@name" only as that tag or mention, a word as a whole word
		// (replies start with "@whoever", so "@whoever" also finds replies to them)
		const has = (term: string) =>
			/\s/.test(term) ? text.includes(term) : /^[#@]/.test(term) ? tokens.includes(term) : plain.has(term);
		if (include.length && !include.some(has)) return false;
		if (exclude.some(has)) return false;
		return true;
	};
}
