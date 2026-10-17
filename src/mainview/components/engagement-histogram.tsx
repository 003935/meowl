import { useMemo, useRef, useState } from "react";
import { binInRange, binLabel, fmtCount, histogram, rangeOfBins } from "@/lib/engagement";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// SVG geometry (the chart scales to the dialog's width)
const W = 520, H = 112, AXIS = 16, TOP = 6;
const PLOT_H = H - AXIS - TOP;

type Props = {
	id: string;
	title: string; // "Likes"
	noun: string; // "likes", for the tooltip
	values: number[];
	/** fill classes for the bars, e.g. "fill-[#db2777] dark:fill-[#ec4899]" */
	barClass: string;
	min: string; // "" = no limit
	max: string;
	onChange: (min: string, max: string) => void;
};

// Distribution of likes (or reposts) across your tweets. Drag across the bars to
// pick a range; the Min/Max boxes underneath show and edit the same range.
export function EngagementHistogram({ id, title, noun, values, barClass, min, max, onChange }: Props) {
	const bins = useMemo(() => histogram(values), [values]);
	const slot = W / bins.length;
	const barW = Math.max(2, slot - 2); // 2px surface gap between adjacent bins
	// Heights on a log scale: one bin (usually "0") would otherwise flatten the rest.
	const top = Math.log1p(Math.max(1, ...bins.map((b) => b.count)));
	const height = (n: number) => (n ? Math.max(2, (Math.log1p(n) / top) * PLOT_H) : 0);

	const svgRef = useRef<SVGSVGElement>(null);
	const drag = useRef<number | null>(null);
	const [hover, setHover] = useState<number | null>(null);
	const ranged = min !== "" || max !== "";

	const binAt = (clientX: number) => {
		const r = svgRef.current!.getBoundingClientRect();
		const x = ((clientX - r.left) / r.width) * W;
		return Math.min(bins.length - 1, Math.max(0, Math.floor(x / slot)));
	};
	const select = (a: number, b: number) => {
		const r = rangeOfBins(bins, a, b);
		onChange(r.min, r.max);
	};

	const digits = (v: string) => v.replace(/\D/g, "");
	const rangeText = !ranged ? "Any" : max === "" ? `${fmtCount(Number(min))}+` : `${fmtCount(Number(min || 0))}–${fmtCount(Number(max))}`;
	const hovered = hover === null ? null : bins[hover];

	return (
		<div className="grid gap-2">
			<div className="flex items-baseline gap-2">
				<span className="text-sm font-medium">{title}</span>
				<span className="text-xs text-muted-foreground tabular-nums">{rangeText}</span>
				{ranged && (
					<Button type="button" variant="link" size="sm" className="ml-auto h-auto p-0 text-xs" onClick={() => onChange("", "")}>
						Clear
					</Button>
				)}
			</div>

			<div className="relative">
				<svg
					ref={svgRef}
					viewBox={`0 0 ${W} ${H}`}
					className="block w-full cursor-crosshair touch-none select-none"
					role="img"
					aria-label={`${title} per tweet: drag across the bars to pick a range`}
					onPointerDown={(e) => {
						e.currentTarget.setPointerCapture(e.pointerId);
						drag.current = binAt(e.clientX);
						select(drag.current, drag.current);
					}}
					onPointerMove={(e) => {
						const i = binAt(e.clientX);
						setHover(i);
						if (drag.current !== null) select(drag.current, i);
					}}
					onPointerUp={() => (drag.current = null)}
					onPointerLeave={() => drag.current === null && setHover(null)}
				>
					{/* baseline */}
					<line x1={0} x2={W} y1={TOP + PLOT_H + 0.5} y2={TOP + PLOT_H + 0.5} className="stroke-border" strokeWidth={1} />
					{bins.map((b, i) => {
						const h = height(b.count);
						const x = i * slot + (slot - barW) / 2;
						const y = TOP + PLOT_H - h;
						const r = Math.min(4, barW / 2, h);
						// 4px rounded top, square at the baseline
						const d = h
							? `M${x},${TOP + PLOT_H} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${TOP + PLOT_H} Z`
							: "";
						const on = binInRange(b, min, max);
						return (
							<g key={b.lo}>
								{/* full-height hover target, bigger than the bar */}
								<rect x={i * slot} y={TOP} width={slot} height={PLOT_H} className={cn("fill-transparent", hover === i && "fill-muted")} />
								{d && <path d={d} className={cn(barClass, "transition-opacity", !on && "opacity-25")} />}
							</g>
						);
					})}
					{/* x-axis labels at 0, 1, 10, 100, 1K… only, so they never collide */}
					{bins.map((b, i) =>
						b.lo === 0 || /^10*$/.test(String(b.lo)) ? (
							<text key={b.lo} x={i * slot + slot / 2} y={H - 3} textAnchor="middle" className="fill-muted-foreground text-[10px]">
								{fmtCount(b.lo)}
							</text>
						) : null,
					)}
				</svg>

				{hovered && (
					<div
						className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md"
						style={{ left: `${((hover! + 0.5) / bins.length) * 100}%` }}
					>
						<span className="font-medium">{binLabel(hovered)} {noun}</span>
						<span className="text-muted-foreground"> · {hovered.count.toLocaleString()} {hovered.count === 1 ? "tweet" : "tweets"}</span>
					</div>
				)}
			</div>

			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<label htmlFor={`${id}-min`}>Min</label>
				<Input id={`${id}-min`} inputMode="numeric" placeholder="0" className="h-8 w-24" value={min} onChange={(e) => onChange(digits(e.target.value), max)} />
				<label htmlFor={`${id}-max`}>Max</label>
				<Input id={`${id}-max`} inputMode="numeric" placeholder="Any" className="h-8 w-24" value={max} onChange={(e) => onChange(min, digits(e.target.value))} />
			</div>

			{/* the same numbers as a table, for screen readers */}
			<table className="sr-only">
				<caption>{title} per tweet</caption>
				<thead><tr><th>{title}</th><th>Tweets</th></tr></thead>
				<tbody>{bins.map((b) => <tr key={b.lo}><td>{binLabel(b)}</td><td>{b.count}</td></tr>)}</tbody>
			</table>
		</div>
	);
}
