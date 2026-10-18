import { InfoIcon, Loader2Icon, SquareIcon } from "lucide-react";
import type { FetchProgress as Fetch } from "../../shared/types";
import { Button } from "@/components/ui/button";

// roughly how far back X's timeline goes
const X_LIMIT = 3200;

// Slim bar under the header when your posts came from "Load from X": what's still
// loading (with Stop), and that older posts need the archive.
export function FetchProgress({ fetch, onStop }: { fetch: Fetch | null; onStop: () => void }) {
	return (
		<div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/30 px-5 py-1.5 text-sm">
			{fetch ? (
				<>
					<Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
					<span>
						{fetch.stopping ? "Stopping" : "Loading"} ({fetch.fetched.toLocaleString()}/{X_LIMIT.toLocaleString()})
						{fetch.username && ` from @${fetch.username}`}
						{fetch.waiting > 0 && ` · rate limited, waiting ${fetch.waiting}s`}
					</span>
				</>
			) : (
				<InfoIcon className="size-4 shrink-0 text-muted-foreground" />
			)}
			<span className="flex-1 text-xs text-muted-foreground">Loading from X only shows recent tweets. Older tweets require the full archive.</span>
			{fetch && (
				<Button size="sm" variant="outline" onClick={onStop} disabled={fetch.stopping}>
					<SquareIcon data-icon="inline-start" /> Stop
				</Button>
			)}
		</div>
	);
}
