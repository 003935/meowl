import { memo, type ReactNode } from "react";
import { ExternalLinkIcon, HeartIcon, Repeat2Icon } from "lucide-react";
import type { Tweet } from "../../shared/types";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

const fmt = (ts: number) =>
	new Date(ts).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// The archive stores text HTML-escaped.
const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const link = "text-sky-600 hover:underline dark:text-sky-400";

// Turn t.co links, @mentions and #hashtags into links / highlights.
function richText(t: Tweet): ReactNode[] {
	const urls = new Map(t.urls.filter((u) => u.url).map((u) => [u.url, u]));
	const pattern = new RegExp(
		[...[...urls.keys()].map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "(?<![\\w])@\\w{1,15}", "(?<![\\w&])#\\w+"].join("|"),
		"g",
	);
	const text = unescape(t.text);
	const out: ReactNode[] = [];
	let last = 0;
	for (const m of text.matchAll(pattern)) {
		const s = m[0];
		out.push(text.slice(last, m.index));
		const u = urls.get(s);
		if (u) out.push(<a key={m.index} className={link} href={u.expanded || u.url}>{u.display || u.expanded || u.url}</a>);
		else if (s.startsWith("@")) out.push(<a key={m.index} className={link} href={`https://x.com/${s.slice(1)}`}>{s}</a>);
		else out.push(<span key={m.index} className="text-sky-600 dark:text-sky-400">{s}</span>);
		last = m.index! + s.length;
	}
	out.push(text.slice(last));
	return out;
}

type Props = {
	tweet: Tweet;
	selected: boolean;
	gone: boolean;
	onToggle: (id: string, shift: boolean) => void;
};

export const TweetCard = memo(function TweetCard({ tweet: t, selected, gone, onToggle }: Props) {
	return (
		<article
			className={cn(
				"flex cursor-pointer gap-3 border-b px-4 py-3 transition-colors hover:bg-muted/40",
				selected && "bg-destructive/10 shadow-[inset_3px_0_0_var(--destructive)] hover:bg-destructive/15",
				gone && "cursor-default opacity-40 hover:bg-transparent",
			)}
			onClick={(e) => {
				if (gone || (e.target as Element).closest("a,video,button")) return;
				onToggle(t.id, e.shiftKey);
			}}
		>
			<Checkbox
				className="mt-0.5 data-checked:border-destructive data-checked:bg-destructive data-checked:text-white"
				checked={selected}
				disabled={gone}
				aria-label="Mark for deletion"
				onClick={(e) => {
					e.preventDefault();
					onToggle(t.id, e.shiftKey);
				}}
			/>
			<div className="min-w-0 flex-1">
				<div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
					<span>{fmt(t.ts)}</span>
					{t.reply_to && <span>↳ @{t.reply_to}</span>}
					<a href={`https://x.com/i/status/${t.id}`} className="inline-flex items-center gap-0.5 hover:text-foreground">
						open <ExternalLinkIcon className="size-3" />
					</a>
					{gone && <Badge variant="destructive">deleted</Badge>}
				</div>
				<p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{richText(t)}</p>
				{t.media.length > 0 && (
					<div className={cn("mt-2 grid gap-1 overflow-hidden rounded-xl", t.media.length > 1 && "grid-cols-2")}>
						{t.media.map((f) =>
							/\.(mp4|mov)$/i.test(f) ? (
								<video key={f} src={mediaUrl(f)} controls playsInline muted preload="none" className="max-h-80 w-full bg-black object-cover" />
							) : (
								<img key={f} src={mediaUrl(f)} loading="lazy" alt="" className="max-h-80 w-full bg-black object-cover" />
							),
						)}
					</div>
				)}
				<div className="mt-1.5 flex gap-4 text-xs text-muted-foreground">
					<span className="inline-flex items-center gap-1 text-pink-600 dark:text-pink-400"><HeartIcon className="size-3" /> {t.likes}</span>
					<span className="inline-flex items-center gap-1"><Repeat2Icon className="size-3" /> {t.retweets_count}</span>
				</div>
			</div>
		</article>
	);
});
