import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, SquareIcon, XIcon } from "lucide-react";
import type { Progress as JobProgress } from "../../shared/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";

type Props = {
	job: JobProgress;
	onStop: () => void;
	onDismiss: () => void;
};

const POLL_MS = 1000; // how often the viewer asks for progress

// Count up to `target` one at a time, spread over the time until the next poll,
// so the numbers tick 1, 2, 3… instead of jumping 6 → 10 → 15.
function useCountUp(target: number) {
	const [shown, setShown] = useState(target);
	useEffect(() => {
		if (shown >= target) {
			if (shown > target) setShown(target); // a new run started from 0
			return;
		}
		const left = target - shown;
		const step = Math.ceil(left / 60); // far behind (e.g. joined mid-run): catch up in bigger steps
		const t = setTimeout(() => setShown((n) => Math.min(target, n + step)), Math.max(16, (POLL_MS * 0.9 * step) / left));
		return () => clearTimeout(t);
	}, [shown, target]);
	return shown;
}

// Slim bar under the header while a deletion runs (and after, until dismissed).
export function DeleteProgress({ job, onStop, onDismiss }: Props) {
	const done = useCountUp(job.done);
	const ok = useCountUp(job.ok);
	const logRef = useRef<HTMLPreElement>(null);
	const atBottom = useRef(true);

	// keep the log pinned to the bottom unless you've scrolled up
	const log = job.log.join("\n");
	useEffect(() => {
		const el = logRef.current;
		if (el && atBottom.current) el.scrollTop = el.scrollHeight;
	}, [log]);

	const pct = job.total ? Math.round((done / job.total) * 100) : 0;
	const status = job.error
		? `Error: ${job.error}`
		: job.running
			? `${job.stopping ? "Stopping… " : "Deleting… "}${done.toLocaleString()}/${job.total.toLocaleString()} · ${ok.toLocaleString()} deleted · ${job.fail} failed${job.waiting ? ` · rate limited, waiting ${job.waiting}s` : ""}`
			: `Finished: ${job.ok.toLocaleString()} deleted, ${job.fail} failed.`;

	return (
		<div className="grid gap-1.5 border-b bg-muted/30 px-5 py-2.5">
			<div className="flex items-center gap-3">
				<div className={cn("flex-1 text-sm", job.error && "text-destructive")}>{status}</div>
				{job.running ? (
					<Button size="sm" variant="outline" onClick={onStop} disabled={job.stopping}>
						<SquareIcon data-icon="inline-start" /> Stop
					</Button>
				) : (
					<Button size="icon-sm" variant="ghost" aria-label="Dismiss" title="Dismiss" onClick={onDismiss}><XIcon /></Button>
				)}
			</div>
			<Progress value={pct} className="h-1.5 [&>[data-slot=progress-indicator]]:bg-destructive" />
			{job.log.length > 0 && (
				<Collapsible className="text-xs text-muted-foreground">
					<CollapsibleTrigger className="group inline-flex items-center gap-1 hover:text-foreground">
						<ChevronDownIcon className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90" />
						Log
					</CollapsibleTrigger>
					<CollapsibleContent>
						<pre
							ref={logRef}
							onScroll={(e) => {
								const el = e.currentTarget;
								atBottom.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
							}}
							className="mt-1 max-h-28 overflow-auto rounded-md bg-background p-2 font-mono text-xs whitespace-pre-wrap"
						>
							{log}
						</pre>
					</CollapsibleContent>
				</Collapsible>
			)}
		</div>
	);
}
