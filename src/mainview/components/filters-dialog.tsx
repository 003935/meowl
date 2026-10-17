import { useState, type ReactNode } from "react";
import { XIcon } from "lucide-react";
import { EMPTY_FILTERS, type Filters, type Presence } from "@/lib/filters";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { DateField } from "@/components/date-field";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	value: Filters;
	onApply: (f: Filters) => void;
	username?: string;
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

function Field({ id, label, hint, ...input }: { id: string; label: string; hint: ReactNode } & React.ComponentProps<typeof Input>) {
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Input id={id} spellCheck={false} autoComplete="off" {...input} />
			<p className="text-xs text-muted-foreground">{hint}</p>
		</div>
	);
}

function PresenceField({ label, noun, value, onChange }: { label: string; noun: string; value: Presence; onChange: (v: Presence) => void }) {
	const options: [Presence, string][] = [
		["all", `Include posts with and without ${noun}`],
		["only", `Only posts with ${noun}`],
		["exclude", `Exclude posts with ${noun}`],
	];
	return (
		<div className="grid gap-2">
			<span className="text-sm font-medium">{label}</span>
			<RadioGroup value={value} onValueChange={(v) => onChange(v as Presence)} className="gap-2">
				{options.map(([v, text]) => (
					<Label key={v} className="flex cursor-pointer items-center justify-between rounded-md px-1 py-1 font-normal hover:bg-muted/50">
						{text}
						<RadioGroupItem value={v} />
					</Label>
				))}
			</RadioGroup>
		</div>
	);
}

// Advanced filters, modelled on X's "Advanced search". Edits a draft; Apply commits it.
export function FiltersDialog({ open, onOpenChange, value, onApply, username, minYear, maxYear }: Props) {
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
	const number = (key: "minLikes" | "minReposts") => ({
		...text(key),
		type: "number",
		min: 0,
		inputMode: "numeric" as const,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent showCloseButton={false} className="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-xl">
				<div className="flex items-center gap-4 border-b px-4 py-3">
					<DialogClose asChild>
						<Button variant="ghost" size="icon" aria-label="Close"><XIcon /></Button>
					</DialogClose>
					<DialogTitle className="flex-1 text-xl font-bold">Filters</DialogTitle>
					<DialogDescription className="sr-only">Narrow the three columns by words, accounts, links and media, engagement and dates.</DialogDescription>
					<Button variant="ghost" onClick={() => setDraft(EMPTY_FILTERS)}>Reset</Button>
					<Button className="rounded-full px-4" onClick={() => { onApply(draft); onOpenChange(false); }}>Apply</Button>
				</div>

				<form className="overflow-y-auto" onSubmit={(e) => { e.preventDefault(); onApply(draft); onOpenChange(false); }}>
					<Section title="Words">
						<Field id="f-all" label="All of these words" hint="Example: what's happening · contains both “what's” and “happening”" {...text("allWords")} />
						<Field id="f-exact" label="This exact phrase" hint="Example: happy hour · contains the exact phrase “happy hour”" {...text("exactPhrase")} />
						<Field id="f-any" label="Any of these words" hint="Example: cats dogs · contains either “cats” or “dogs” (or both)" {...text("anyWords")} />
						<Field id="f-none" label="None of these words" hint="Example: cats dogs · does not contain “cats” and does not contain “dogs”" {...text("noneWords")} />
						<Field id="f-tags" label="These hashtags" hint="Example: #ThrowbackThursday · contains the hashtag #ThrowbackThursday" {...text("hashtags")} />
					</Section>
					<Separator />
					<Section title="Accounts">
						<Field
							id="f-from" label="From these accounts" {...text("fromAccounts")}
							hint={<>Example: @X · posted by @X. Your own posts are from {username ? `@${username}` : "you (re-import the archive to match them by handle)"}; a retweet is from the account it reposted.</>}
						/>
						<Field id="f-to" label="To these accounts" hint="Example: @X · sent in reply to @X" {...text("toAccounts")} />
						<Field id="f-mention" label="Mentioning these accounts" hint="Example: @SFBART @Caltrain · mentions @SFBART or mentions @Caltrain" {...text("mentioning")} />
					</Section>
					<Separator />
					<Section title="Filters">
						<PresenceField label="Links" noun="links" value={draft.links} onChange={(links) => setDraft((d) => ({ ...d, links }))} />
						<PresenceField label="Media" noun="photos or videos" value={draft.media} onChange={(media) => setDraft((d) => ({ ...d, media }))} />
					</Section>
					<Separator />
					<Section title="Engagement">
						<Field id="f-likes" label="Minimum Likes" hint="Example: 280 · posts with at least 280 Likes" {...number("minLikes")} />
						<Field id="f-reposts" label="Minimum reposts" hint="Example: 280 · posts with at least 280 reposts" {...number("minReposts")} />
						<p className="-mt-2 text-xs text-muted-foreground">Your X archive doesn't record reply counts, so there's no minimum-replies filter.</p>
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
