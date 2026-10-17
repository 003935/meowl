import { useEffect, useMemo, useRef, useState } from "react";
import { ListChecksIcon, XIcon } from "lucide-react";
import type { Archive, Kind } from "../../shared/types";
import { KINDS } from "@/lib/kinds";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TweetCard } from "@/components/tweet-card";

const PAGE = 100;
const MIN_WIDTH = 300;
const WIDTH_KEY = "reviewPanelWidth";

const readWidth = () => {
	try { return Math.max(MIN_WIDTH, Number(localStorage.getItem(WIDTH_KEY)) || 420); } catch { return 420; }
};

type Props = {
	data: Archive;
	selected: Set<string>;
	onToggle: (id: string) => void;
	onClose: () => void;
};

// Docked side panel listing everything marked for deletion. It sits beside the
// columns (no overlay), so ticking in the columns keeps working while it's open.
// Drag its left edge to resize.
export function ReviewPanel({ data, selected, onToggle, onClose }: Props) {
	const [kind, setKind] = useState<Kind | null>(null);
	const [shown, setShown] = useState(PAGE);
	const [width, setWidth] = useState(readWidth);
	const [dragging, setDragging] = useState(false);

	// Rows unticked from this panel stay listed (unticked) so a slip can be re-ticked.
	const [kept, setKept] = useState<Set<string>>(new Set());
	const toggle = (id: string) => {
		if (selected.has(id)) setKept((k) => new Set(k).add(id));
		onToggle(id);
	};

	const groups = useMemo(
		() => Object.fromEntries(KINDS.map(({ kind: k }) => [k, data[k].filter((t) => selected.has(t.id) || kept.has(t.id))])) as Archive,
		[data, selected, kept],
	);
	const list = useMemo(
		() => (kind ? groups[kind] : [...groups.tweets, ...groups.replies, ...groups.retweets].sort((a, b) => a.ts - b.ts)),
		[groups, kind],
	);
	const counts = Object.fromEntries(KINDS.map(({ kind: k }) => [k, groups[k].filter((t) => selected.has(t.id)).length])) as Record<Kind, number>;

	// ---- drag to resize ----
	const start = useRef({ x: 0, width: 0 });
	useEffect(() => {
		if (!dragging) return;
		const move = (e: PointerEvent) => {
			const max = Math.max(MIN_WIDTH, window.innerWidth * 0.8);
			setWidth(Math.min(max, Math.max(MIN_WIDTH, start.current.width + start.current.x - e.clientX)));
		};
		const up = () => setDragging(false);
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		return () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
	}, [dragging]);
	useEffect(() => {
		if (dragging) return;
		try { localStorage.setItem(WIDTH_KEY, String(Math.round(width))); } catch {}
	}, [dragging, width]);

	return (
		<aside className="relative flex min-h-0 shrink-0 flex-col border-l bg-background" style={{ width }} aria-label="Review selected">
			<div
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize panel"
				title="Drag to resize"
				className={cn(
					"absolute inset-y-0 -left-1.5 z-20 w-3 cursor-col-resize touch-none",
					"after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:transition-colors hover:after:bg-ring",
					dragging && "after:bg-ring",
				)}
				onPointerDown={(e) => {
					e.preventDefault();
					start.current = { x: e.clientX, width };
					setDragging(true);
				}}
				onDoubleClick={() => setWidth(420)}
			/>
			{/* keep text from being selected and iframes/videos from eating events while dragging */}
			{dragging && <div className="fixed inset-0 z-50 cursor-col-resize select-none" />}

			<div className="flex items-center gap-2 border-b px-4 py-2.5">
				<h2 className="flex flex-1 items-center gap-2 text-sm font-semibold">
					<ListChecksIcon className="size-4 text-muted-foreground" aria-hidden />
					Review selected <span className="font-normal text-muted-foreground tabular-nums">({selected.size.toLocaleString()})</span>
				</h2>
				{KINDS.map(({ kind: k, title, Icon }) => (
					<Button
						key={k}
						size="icon-sm"
						variant={kind === k ? "default" : "ghost"}
						aria-pressed={kind === k}
						aria-label={`${title}: ${counts[k]}`}
						title={`${title} (${counts[k].toLocaleString()}) — click again to show all`}
						onClick={() => { setKind(kind === k ? null : k); setShown(PAGE); }}
					>
						<Icon />
					</Button>
				))}
				<Button size="icon-sm" variant="ghost" aria-label="Close" title="Close" onClick={onClose}><XIcon /></Button>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{list.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing selected{kind ? " here" : " yet"}.</div>}
				{list.slice(0, shown).map((t) => (
					<TweetCard key={t.id} tweet={t} selected={selected.has(t.id)} onToggle={toggle} />
				))}
				{shown < list.length && (
					<div className="p-3 text-center">
						<Button variant="ghost" size="sm" onClick={() => setShown((n) => n + PAGE)}>
							Show more ({(list.length - shown).toLocaleString()} left)
						</Button>
					</div>
				)}
			</div>

		</aside>
	);
}
