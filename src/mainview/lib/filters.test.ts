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

const match = (f: Partial<Filters>, t: Partial<Tweet>, quick = "") =>
	makeMatcher({ ...EMPTY_FILTERS, ...f }, quick)(tweet(t));

describe("words", () => {
	test("include: any one of the comma-separated terms is enough, ignoring case", () => {
		expect(match({ include: "Happening, cats" }, { text: "What's happening today" })).toBe(true);
		expect(match({ include: "dogs, cats" }, { text: "What's happening today" })).toBe(false);
		expect(match({ include: "" }, { text: "anything" })).toBe(true);
	});
	test("whole words, not substrings", () => {
		expect(match({ include: "cat" }, { text: "concatenate" })).toBe(false);
	});
	test("a term with spaces is a phrase; quotes are optional", () => {
		expect(match({ include: "happy hour" }, { text: "Happy hour at 5" })).toBe(true);
		expect(match({ include: "happy hour" }, { text: "hour of happy" })).toBe(false);
		expect(match({ include: '"happy hour"' }, { text: "Happy hour at 5" })).toBe(true);
	});
	test("exclude: none of the terms may appear", () => {
		expect(match({ exclude: "cats, dogs" }, { text: "I like dogs" })).toBe(false);
		expect(match({ exclude: "cats, dogs" }, { text: "I like birds" })).toBe(true);
		expect(match({ include: "like", exclude: "like dogs" }, { text: "I like dogs" })).toBe(false);
	});
	test("#tags match only the hashtag; plain words also match tags", () => {
		expect(match({ include: "#Throwback" }, { text: "old pic #throwback" })).toBe(true);
		expect(match({ include: "#throwback" }, { text: "a throwback, no tag" })).toBe(false);
		expect(match({ include: "throwback" }, { text: "old pic #throwback" })).toBe(true);
		expect(match({ exclude: "#nsfw" }, { text: "very #nsfw" })).toBe(false);
	});
	test("@names find mentions, including the @ that starts a reply", () => {
		expect(match({ include: "@Caltrain" }, { text: "late again @caltrain" })).toBe(true);
		expect(match({ include: "@SFBART" }, { text: "SFBART is late" })).toBe(false);
		expect(match({ include: "@bob" }, { text: "@bob agreed", reply_to: "bob" })).toBe(true);
	});
	test("archive text is HTML-escaped", () => {
		expect(match({ include: "you & me" }, { text: "you &amp; me" })).toBe(true);
	});
	test("quick search from the header", () => {
		expect(match({}, { text: "Hello World" }, "world hello")).toBe(true);
		expect(match({}, { text: "Hello World" }, "#fun")).toBe(false);
		expect(match({}, { text: "so #fun" }, "#fun")).toBe(true);
	});
	test("quick search matches every word, in any order", () => {
		expect(match({}, { text: "this pizza is bad" }, "bad pizza")).toBe(true);
		expect(match({}, { text: "this pizza is bad" }, "  pizza   bad ")).toBe(true);
		expect(match({}, { text: "this pizza is good" }, "bad pizza")).toBe(false);
	});
	test("quick search matches whole words and their variants, not longer words", () => {
		expect(match({}, { text: "my cat is asleep" }, "cat")).toBe(true);
		expect(match({}, { text: "so many cats" }, "cat")).toBe(true);
		expect(match({}, { text: "my cat is asleep" }, "cats")).toBe(true);
		expect(match({}, { text: "scattered categories" }, "cat")).toBe(false);
		expect(match({}, { text: "a carpet in the car park" }, "carp")).toBe(false);
		expect(match({}, { text: "kept running" }, "run")).toBe(true);
		expect(match({}, { text: "I DELETED it" }, "delete")).toBe(true);
		expect(match({}, { text: "it's (fine)" }, "(fine")).toBe(true);
		expect(match({}, { text: "don’t" }, "don't")).toBe(true);
	});
	test("quick search: * is not a wildcard", () => {
		expect(match({}, { text: "categories" }, "cat*")).toBe(false);
	});
	test("quick search: @names and #tags match only that mention or tag", () => {
		expect(match({}, { text: "@bigcatfan hi" }, "cat")).toBe(false);
		expect(match({}, { text: "@bigcatfan hi" }, "@bigcatfan")).toBe(true);
		expect(match({}, { text: "@bigcatfan hi" }, "bigcatfan")).toBe(true);
		expect(match({}, { text: "bigcatfan hi" }, "@bigcatfan")).toBe(false);
	});
	test("quick search ignores accents", () => {
		expect(match({}, { text: "Best Café ever" }, "cafe")).toBe(true);
		expect(match({}, { text: "best cafe ever" }, "café")).toBe(true);
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
	test("maximum likes and reposts (inclusive; empty = no limit)", () => {
		expect(match({ maxLikes: "10" }, { likes: 10 })).toBe(true);
		expect(match({ maxLikes: "10" }, { likes: 11 })).toBe(false);
		expect(match({ maxLikes: "0" }, { likes: 0 })).toBe(true);
		expect(match({ minLikes: "5", maxLikes: "9" }, { likes: 7 })).toBe(true);
		expect(match({ maxReposts: "2" }, { retweets_count: 3 })).toBe(false);
	});
	test("dates are inclusive on both ends", () => {
		expect(match({ since: "2016-06-15", until: "2016-06-15" }, {})).toBe(true);
		expect(match({ since: "2016-06-16" }, {})).toBe(false);
		expect(match({ until: "2016-06-14" }, {})).toBe(false);
	});
	test("active filter count", () => {
		expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
		expect(activeFilterCount({ ...EMPTY_FILTERS, include: "x", links: "only", since: "2016-01-01" })).toBe(3);
		expect(activeFilterCount({ ...EMPTY_FILTERS, include: "   " })).toBe(0);
	});
});
