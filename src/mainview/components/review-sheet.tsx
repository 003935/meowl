import { useMemo, useState } from "react";
import { ListChecksIcon } from "lucide-react";
import type { Archive, Kind, Tweet } from "../../shared/types";
import { KINDS } from "@/lib/kinds";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TweetCard } from "@/components/tweet-card";

const PAGE = 100;

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	data: Archive;
	selected: Set<string>;
	onToggle: (id: string) => void;
	onClear: () => void;
};

// Side panel listing everything marked for deletion, so it can be checked before deleting.
export function ReviewSheet({ open, onOpenChange, data, selected, onToggle, onClear }: Props) {
	const [kind, setKind] = useState<Kind | "all">("all");
	const [shown, setShown] = useState(PAGE);

	// Ticked tweets per kind, oldest first. Unticking from here keeps the row visible
	// (unticked) until the panel is reopened, so a slip can be undone.
	const [snapshot, setSnapshot] = useState<Record<Kind, Tweet[]> | null>(null);
	const [wasOpen, setWasOpen] = useState(false);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setSnapshot(Object.fromEntries(KINDS.map(({ kind: k }) => [k, data[k].filter((t) => selected.has(t.id))])) as Record<Kind, Tweet[]>);
			setShown(PAGE);
		}
	}
	const groups = snapshot ?? { tweets: [], replies: [], retweets: [] };

	const list = useMemo(
		() => (kind === "all" ? [...groups.tweets, ...groups.replies, ...groups.retweets].sort((a, b) => a.ts - b.ts) : groups[kind]),
		[groups, kind],
	);
	const counts = Object.fromEntries(KINDS.map(({ kind: k }) => [k, groups[k].filter((t) => selected.has(t.id)).length])) as Record<Kind, number>;

	const tabs: { key: Kind | "all"; label: string; n: number; Icon?: (typeof KINDS)[number]["Icon"] }[] = [
		{ key: "all", label: "All", n: selected.size },
		...KINDS.map(({ kind: k, title, Icon }) => ({ key: k, label: title, n: counts[k], Icon })),
	];

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-full gap-0 sm:max-w-lg">
				<SheetHeader className="border-b">
					<SheetTitle className="flex items-center gap-2"><ListChecksIcon className="size-4" /> Marked for deletion</SheetTitle>
					<SheetDescription>{selected.size.toLocaleString()} ticked. Click one to untick it (click again to re-tick).</SheetDescription>
					<div className="mt-2 flex flex-wrap gap-1.5">
						{tabs.map(({ key, label, n, Icon }) => (
							<Button key={key} size="sm" variant={kind === key ? "default" : "outline"} className="rounded-full" onClick={() => { setKind(key); setShown(PAGE); }}>
								{Icon && <Icon data-icon="inline-start" />}
								{label} <span className={cn("tabular-nums", kind !== key && "text-muted-foreground")}>{n.toLocaleString()}</span>
							</Button>
						))}
					</div>
				</SheetHeader>

				<div className="min-h-0 flex-1 overflow-y-auto">
					{list.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing marked here.</div>}
					{list.slice(0, shown).map((t) => (
						<TweetCard key={t.id} tweet={t} selected={selected.has(t.id)} gone={false} onToggle={onToggle} />
					))}
					{shown < list.length && (
						<div className="p-3 text-center">
							<Button variant="ghost" size="sm" onClick={() => setShown((n) => n + PAGE)}>
								Show more ({(list.length - shown).toLocaleString()} left)
							</Button>
						</div>
					)}
				</div>

				<SheetFooter className="flex-row justify-end border-t">
					<Button variant="ghost" disabled={!selected.size} onClick={onClear}>Untick all</Button>
					<Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
