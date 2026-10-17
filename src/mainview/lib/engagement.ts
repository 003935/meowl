// Bins for the likes / reposts histograms. Engagement is heavily skewed (most
// tweets get a handful, a few get hundreds of thousands), so bins grow in
// 1-2.5-5 steps: 0 | 1 | 2–4 | 5–9 | 10–24 | 25–49 | 50–99 | 100–249 | …
// The last bin is open-ended ("250K+").

export type Bin = { lo: number; hi: number; count: number }; // hi = Infinity for the last bin

/** Bin lower edges, enough to cover `max` (at least up to 10 so small archives still get a chart). */
export function binEdges(max: number): number[] {
	const edges = [0, 1];
	for (let k = 0; ; k++) {
		for (const step of k === 0 ? [2, 5] : [1, 2.5, 5]) {
			const edge = Math.round(step * 10 ** k);
			if (edge > Math.max(max, 10)) return edges;
			edges.push(edge);
		}
	}
}

export function histogram(values: number[]): Bin[] {
	let max = 0;
	for (const v of values) if (v > max) max = v;
	const edges = binEdges(max);
	const bins: Bin[] = edges.map((lo, i) => ({ lo, hi: i + 1 < edges.length ? edges[i + 1] - 1 : Infinity, count: 0 }));
	for (const v of values) {
		let i = bins.length - 1;
		while (i > 0 && v < bins[i].lo) i--;
		bins[i].count++;
	}
	return bins;
}

/** The min/max filter values ("" = no limit) for dragging across bins `a`..`b`. */
export function rangeOfBins(bins: Bin[], a: number, b: number): { min: string; max: string } {
	const lo = bins[Math.min(a, b)], hi = bins[Math.max(a, b)];
	return { min: lo.lo === 0 ? "" : String(lo.lo), max: hi.hi === Infinity ? "" : String(hi.hi) };
}

/** Whether a bin overlaps the min/max filter values. */
export function binInRange(bin: Bin, min: string, max: string) {
	const lo = min === "" ? 0 : Number(min);
	const hi = max === "" ? Infinity : Number(max);
	return bin.hi >= lo && bin.lo <= hi;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const fmtCount = (n: number) => compact.format(n);

/** "0", "2–4", "250K+" */
export function binLabel(bin: Bin) {
	if (bin.hi === Infinity) return `${fmtCount(bin.lo)}+`;
	return bin.lo === bin.hi ? fmtCount(bin.lo) : `${fmtCount(bin.lo)}–${fmtCount(bin.hi)}`;
}
