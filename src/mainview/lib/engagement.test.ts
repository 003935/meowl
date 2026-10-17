import { describe, expect, test } from "bun:test";
import { binEdges, binInRange, binLabel, histogram, rangeOfBins } from "./engagement";

describe("engagement bins", () => {
	test("edges grow in 1-2.5-5 steps and cover the max", () => {
		expect(binEdges(0)).toEqual([0, 1, 2, 5, 10]);
		expect(binEdges(381397)).toEqual([0, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000]);
	});

	test("every value lands in exactly one bin", () => {
		const bins = histogram([0, 0, 1, 3, 4, 5, 24, 25, 381397]);
		expect(bins.reduce((n, b) => n + b.count, 0)).toBe(9);
		expect(bins[0]).toEqual({ lo: 0, hi: 0, count: 2 });
		expect(bins[2]).toEqual({ lo: 2, hi: 4, count: 2 });
		expect(bins.at(-1)).toEqual({ lo: 250000, hi: Infinity, count: 1 });
	});

	test("dragging across bins gives an inclusive min/max; ends are open", () => {
		const bins = histogram([0, 3, 30, 300]);
		expect(rangeOfBins(bins, 2, 4)).toEqual({ min: "2", max: "24" });
		expect(rangeOfBins(bins, 4, 2)).toEqual({ min: "2", max: "24" });
		expect(rangeOfBins(bins, 0, 1)).toEqual({ min: "", max: "1" });
		expect(rangeOfBins(bins, 3, bins.length - 1)).toEqual({ min: "5", max: "" });
	});

	test("typed ranges highlight every bin they overlap", () => {
		const bin = { lo: 10, hi: 24, count: 0 };
		expect(binInRange(bin, "", "")).toBe(true);
		expect(binInRange(bin, "20", "")).toBe(true);
		expect(binInRange(bin, "25", "")).toBe(false);
		expect(binInRange(bin, "", "9")).toBe(false);
	});

	test("labels", () => {
		expect(binLabel({ lo: 0, hi: 0, count: 0 })).toBe("0");
		expect(binLabel({ lo: 2, hi: 4, count: 0 })).toBe("2–4");
		expect(binLabel({ lo: 1000, hi: 2499, count: 0 })).toBe("1K–2.5K");
		expect(binLabel({ lo: 250000, hi: Infinity, count: 0 })).toBe("250K+");
	});
});
