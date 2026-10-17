import { describe, expect, test } from "bun:test";
import type { Tweet } from "../../shared/types";
import { EMPTY_FILTERS, activeFilterCount, makeMatcher, type Filters } from "./filters";

const tweet = (over: Partial<Tweet>): Tweet => ({
	id: "1",
	created_at: "",
	ts: new Date("2016-06-15T12:00:00").getTime(),
	text: "",
	likes: 0,
	retweets_count: 0,
	urls: [],
	media: [],
	...over,
});

const match = (f: Partial<Filters>, t: Partial<Tweet>, quick = "", username = "me") =>
	makeMatcher({ ...EMPTY_FILTERS, ...f }, quick, username)(tweet(t));

describe("words", () => {
	test("all of these words, any order, ignoring case", () => {
		expect(match({ allWords: "happening what's" }, { text: "What's happening today" })).toBe(true);
		expect(match({ allWords: "happening cats" }, { text: "What's happening today" })).toBe(false);
	});
	test("whole words, not substrings", () => {
		expect(match({ allWords: "cat" }, { text: "concatenate" })).toBe(false);
	});
	test("exact phrase", () => {
		expect(match({ exactPhrase: "happy hour" }, { text: "Happy hour at 5" })).toBe(true);
		expect(match({ exactPhrase: "happy hour" }, { text: "hour of happy" })).toBe(false);
	});
	test("any / none", () => {
		expect(match({ anyWords: "cats dogs" }, { text: "I like dogs" })).toBe(true);
		expect(match({ anyWords: "cats dogs" }, { text: "I like birds" })).toBe(false);
		expect(match({ noneWords: "cats dogs" }, { text: "I like dogs" })).toBe(false);
		expect(match({ noneWords: "cats dogs" }, { text: "I like birds" })).toBe(true);
	});
	test("hashtags need the # in the tweet", () => {
		expect(match({ hashtags: "#Throwback" }, { text: "old pic #throwback" })).toBe(true);
		expect(match({ hashtags: "throwback" }, { text: "a throwback, no tag" })).toBe(false);
	});
	test("archive text is HTML-escaped", () => {
		expect(match({ exactPhrase: "you & me" }, { text: "you &amp; me" })).toBe(true);
	});
	test("quick search from the header", () => {
		expect(match({}, { text: "Hello World" }, "o wor")).toBe(true);
		expect(match({}, { text: "Hello World" }, "nope")).toBe(false);
	});
});

describe("accounts", () => {
	test("from: own posts match your handle, retweets match the reposted account", () => {
		expect(match({ fromAccounts: "@Me" }, { text: "hi" })).toBe(true);
		expect(match({ fromAccounts: "@nasa" }, { text: "hi" })).toBe(false);
		expect(match({ fromAccounts: "@nasa" }, { text: "RT @NASA: wow", rt_of: "NASA" })).toBe(true);
	});
	test("to: replies to an account", () => {
		expect(match({ toAccounts: "@bob" }, { reply_to: "Bob" })).toBe(true);
		expect(match({ toAccounts: "@bob" }, {})).toBe(false);
	});
	test("mentioning any of the accounts", () => {
		expect(match({ mentioning: "@SFBART @Caltrain" }, { text: "late again @caltrain" })).toBe(true);
		expect(match({ mentioning: "@SFBART" }, { text: "SFBART is late" })).toBe(false);
	});
});

describe("filters, engagement, dates", () => {
	test("links and media", () => {
		const withLink = { urls: [{ url: "https://t.co/x" }] };
		expect(match({ links: "only" }, withLink)).toBe(true);
		expect(match({ links: "only" }, {})).toBe(false);
		expect(match({ links: "exclude" }, withLink)).toBe(false);
		expect(match({ media: "only" }, { media: ["1-a.jpg"] })).toBe(true);
		expect(match({ media: "exclude" }, { media: ["1-a.jpg"] })).toBe(false);
	});
	test("minimum likes and reposts", () => {
		expect(match({ minLikes: "10" }, { likes: 10 })).toBe(true);
		expect(match({ minLikes: "10" }, { likes: 9 })).toBe(false);
		expect(match({ minReposts: "3" }, { retweets_count: 2 })).toBe(false);
	});
	test("dates are inclusive on both ends", () => {
		expect(match({ since: "2016-06-15", until: "2016-06-15" }, {})).toBe(true);
		expect(match({ since: "2016-06-16" }, {})).toBe(false);
		expect(match({ until: "2016-06-14" }, {})).toBe(false);
	});
	test("active filter count", () => {
		expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
		expect(activeFilterCount({ ...EMPTY_FILTERS, allWords: "x", links: "only", since: "2016-01-01" })).toBe(3);
		expect(activeFilterCount({ ...EMPTY_FILTERS, allWords: "   " })).toBe(0);
	});
});
