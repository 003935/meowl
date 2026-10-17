import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import type { Tweet } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { TweetCard } from "@/components/tweet-card";

const CHUNK = 150;

type Props = {
	title: string;
	Icon: LucideIcon;
	list: Tweet[]; // already filtered + sorted
	yearHeaders: boolean; // off when sorted by likes, where years are mixed
	selected: Set<string>;
	onToggle: (id: string, shift: boolean) => void;
	onTickAll: () => void;
	onUntickAll: () => void;
};

// One column, rendered CHUNK tweets at a time as you scroll.
export function TweetColumn({ title, Icon, list, yearHeaders, selected, onToggle, onTickAll, onUntickAll }: Props) {
	const [shown, setShown] = useState(CHUNK);
	const scrollRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);

	// new filter/order → back to the top
	useEffect(() => {
		setShown(CHUNK);
		scrollRef.current?.scrollTo({ top: 0 });
	}, [list]);

	useEffect(() => {
		const el = sentinelRef.current;
		if (!el) return;
		const io = new IntersectionObserver((es) => es[0].isIntersecting && setShown((n) => Math.min(n + CHUNK, list.length)), {
			root: scrollRef.current,
			rootMargin: "800px",
		});
		io.observe(el);
		return () => io.disconnect();
	}, [list, shown]);

	// One button: "Tick all" until everything shown is ticked, then "Untick all".
	const allTicked = useMemo(() => list.length > 0 && list.every((t) => selected.has(t.id)), [list, selected]);

	let lastYear: number | null = null;
	return (
		<section className="flex min-h-0 min-w-0 flex-col border-b lg:border-r lg:border-b-0 lg:last:border-r-0">
			<div className="flex items-center gap-2 border-b px-4 py-2.5">
				<h2 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
					<Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
					<span className="truncate">
						{title} <span className="font-normal text-muted-foreground">({list.length.toLocaleString()})</span>
					</span>
				</h2>
				<Button
					size="sm"
					variant={allTicked ? "secondary" : "outline"}
					className="w-24 shrink-0"
					onClick={allTicked ? onUntickAll : onTickAll}
					disabled={!list.length}
					title={allTicked ? "Untick everything shown in this column" : "Tick everything shown in this column"}
				>
					{allTicked ? "Untick all" : "Tick all"}
				</Button>
			</div>
			<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
				{list.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted-foreground">No matches.</div>}
				{list.slice(0, shown).map((t) => {
					const y = new Date(t.ts).getFullYear();
					const header = yearHeaders && y !== lastYear;
					lastYear = y;
					return (
						<Fragment key={t.id}>
							{header && (
								<div className="sticky top-0 z-10 border-b bg-background/95 px-4 py-1.5 text-xs font-bold tracking-wide text-muted-foreground backdrop-blur">
									{y}
								</div>
							)}
							<TweetCard tweet={t} selected={selected.has(t.id)} onToggle={onToggle} />
						</Fragment>
					);
				})}
				{shown < list.length && <div ref={sentinelRef} className="h-px" />}
			</div>
		</section>
	);
}
