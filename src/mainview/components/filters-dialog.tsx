import { useState, type ReactNode } from "react";
import { XIcon } from "lucide-react";
import { EMPTY_FILTERS, type Filters, type Presence } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DateField } from "@/components/date-field";
import { EngagementHistogram } from "@/components/engagement-histogram";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	value: Filters;
	onApply: (f: Filters) => void;
	/** like and repost counts of every tweet, for the Engagement charts */
	engagement: { likes: number[]; reposts: number[] };
	minYear: number;
	maxYear: number;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="grid gap-5 px-6 py-5">
			<h3 className="text-lg font-bold">{title}</h3>
			{children}
		</section>
	);
}

function Field({ id, label, hint, ...input }: { id: string; label: string; hint?: ReactNode } & React.ComponentProps<typeof Input>) {
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Input id={id} spellCheck={false} autoComplete="off" {...input} />
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
		</div>
	);
}

// "Only posts with …" / "Exclude posts with …" in the old radio-list layout, but
// clicking the selected row again unselects it (= show posts with and without).
function PresenceField({ label, noun, value, onChange }: { label: string; noun: string; value: Presence; onChange: (v: Presence) => void }) {
	const options: [Exclude<Presence, "all">, string][] = [
		["only", `Only posts with ${noun}`],
		["exclude", `Exclude posts with ${noun}`],
	];
	return (
		<div className="grid gap-2">
			<span className="text-sm font-medium">{label}</span>
			<div className="grid gap-2">
				{options.map(([v, text]) => {
					const on = value === v;
					return (
						<button
							key={v}
							type="button"
							role="checkbox"
							aria-checked={on}
							onClick={() => onChange(on ? "all" : v)}
							className="flex items-center justify-between rounded-md px-1 py-1 text-left text-sm hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
						>
							{text}
							{/* looks like the radio it replaced */}
							<span className={cn("relative size-4 shrink-0 rounded-full border border-input dark:bg-input/30", on && "border-primary bg-primary dark:bg-primary")}>
								{on && <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" />}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

// Advanced filters, modelled on X's "Advanced search". Edits a draft; Apply commits it.
export function FiltersDialog({ open, onOpenChange, value, onApply, engagement, minYear, maxYear }: Props) {
	const [draft, setDraft] = useState(value);
	const [wasOpen, setWasOpen] = useState(open);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) setDraft(value); // start from what's applied each time it opens
	}

	const text = (key: keyof Filters) => ({
		value: draft[key],
		onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [key]: e.target.value })),
	});
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent showCloseButton={false} className="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-xl">
				<div className="flex items-center gap-4 border-b px-4 py-3">
					<DialogClose asChild>
						<Button variant="ghost" size="icon" aria-label="Close"><XIcon /></Button>
					</DialogClose>
					<DialogTitle className="flex-1 text-xl font-bold">Filters</DialogTitle>
					<DialogDescription className="sr-only">Narrow the three columns by words, links and media, engagement and dates.</DialogDescription>
					<Button variant="ghost" onClick={() => setDraft(EMPTY_FILTERS)}>Reset</Button>
					<Button className="rounded-full px-4" onClick={() => { onApply(draft); onOpenChange(false); }}>Apply</Button>
				</div>

				<form className="overflow-y-auto" onSubmit={(e) => { e.preventDefault(); onApply(draft); onOpenChange(false); }}>
					<Section title="Words">
						<Field id="f-include" label="Include" placeholder={'"exact phrase", word, #tag, @account'} hint="Tweets must contain all of these. Comma separated." {...text("include")} />
						<Field id="f-exclude" label="Exclude" placeholder={'"exact phrase", word, #tag, @account'} hint="Hide tweets containing any of these. Comma separated." {...text("exclude")} />
					</Section>
					<Separator />
					<Section title="Filters">
						<PresenceField label="Links" noun="links" value={draft.links} onChange={(links) => setDraft((d) => ({ ...d, links }))} />
						<PresenceField label="Media" noun="photos or videos" value={draft.media} onChange={(media) => setDraft((d) => ({ ...d, media }))} />
					</Section>
					<Separator />
					<Section title="Engagement">
						<EngagementHistogram
							id="f-likes" title="Likes" noun="likes" values={engagement.likes}
							barClass="fill-[#db2777] dark:fill-[#ec4899]"
							min={draft.minLikes} max={draft.maxLikes}
							onChange={(minLikes, maxLikes) => setDraft((d) => ({ ...d, minLikes, maxLikes }))}
						/>
						<EngagementHistogram
							id="f-reposts" title="Reposts" noun="reposts" values={engagement.reposts}
							barClass="fill-[#0284c7] dark:fill-[#3b82f6]"
							min={draft.minReposts} max={draft.maxReposts}
							onChange={(minReposts, maxReposts) => setDraft((d) => ({ ...d, minReposts, maxReposts }))}
						/>
					</Section>
					<Separator />
					<Section title="Dates">
						<DateField label="From" value={draft.since} onChange={(since) => setDraft((d) => ({ ...d, since }))} minYear={minYear} maxYear={maxYear} />
						<DateField label="To" value={draft.until} onChange={(until) => setDraft((d) => ({ ...d, until }))} minYear={minYear} maxYear={maxYear} />
					</Section>
					<button type="submit" hidden />
				</form>
			</DialogContent>
		</Dialog>
	);
}
