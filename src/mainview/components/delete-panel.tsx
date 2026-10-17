import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, Loader2Icon, SquareIcon, Trash2Icon } from "lucide-react";
import type { Progress as JobProgress } from "../../shared/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

type Props = {
	ticked: number;
	job: JobProgress | null;
	startError: string | null;
	dataDir: string;
	onDelete: (token: string) => void;
	onStop: () => void;
};

export function DeletePanel({ ticked, job, startError, dataDir, onDelete, onStop }: Props) {
	const [token, setToken] = useState("");
	const running = !!job?.running;
	const logRef = useRef<HTMLPreElement>(null);

	// keep the log pinned to the bottom unless you've scrolled up
	const log = job?.log.join("\n") ?? "";
	const atBottom = useRef(true);
	useEffect(() => {
		const el = logRef.current;
		if (el && atBottom.current) el.scrollTop = el.scrollHeight;
	}, [log]);

	const pct = job?.total ? Math.round((job.done / job.total) * 100) : 0;
	const error = startError ?? job?.error;
	const status = error
		? `Error: ${error}`
		: !job
			? ""
			: job.running
				? `${job.stopping ? "Stopping… " : ""}${job.done}/${job.total} · ${job.ok} deleted · ${job.fail} failed${job.waiting ? ` · rate limited, waiting ${job.waiting}s` : ""}`
				: `Finished: ${job.ok} deleted, ${job.fail} failed.${job.fail ? " Failed ones are still ticked — you can retry." : ""}`;
	const showProgress = !!startError || running || !!job?.log.length;

	return (
		<div className="grid gap-3 border-b bg-muted/30 px-4 py-3">
			<div className="flex flex-wrap items-center gap-2">
				<Input
					type="password"
					className="min-w-60 flex-1 font-mono text-xs"
					placeholder="Paste your X auth_token here"
					autoComplete="off"
					spellCheck={false}
					value={token}
					onChange={(e) => setToken(e.target.value)}
				/>
				<Button variant="destructive" disabled={running || !ticked || !token.trim()} onClick={() => onDelete(token.trim())}>
					{running ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <Trash2Icon data-icon="inline-start" />}
					{running ? "Deleting…" : `Delete ${ticked.toLocaleString()} ticked`}
				</Button>
				{running && (
					<Button variant="outline" onClick={onStop} disabled={job?.stopping}>
						<SquareIcon data-icon="inline-start" /> Stop
					</Button>
				)}
			</div>

			<Collapsible className="text-xs text-muted-foreground">
				<CollapsibleTrigger className="group inline-flex items-center gap-1 hover:text-foreground">
					<ChevronDownIcon className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90" />
					Where do I find my auth_token?
				</CollapsibleTrigger>
				<CollapsibleContent className="pt-2">
					<ol className="ml-5 list-decimal space-y-1">
						<li>Open <a className="text-sky-600 hover:underline dark:text-sky-400" href="https://x.com">x.com</a> logged in, in Chrome, Edge, Safari or Firefox.</li>
						<li>
							Open DevTools (<kbd className="rounded bg-muted px-1">F12</kbd> or <kbd className="rounded bg-muted px-1">⌥⌘I</kbd>) → <b>Application</b> (Chrome/Edge) or <b>Storage</b> (Safari/Firefox) → <b>Cookies</b> → <code className="rounded bg-muted px-1">https://x.com</code>.
						</li>
						<li>Copy the <b>Value</b> of the <code className="rounded bg-muted px-1">auth_token</code> row and paste it above.</li>
					</ol>
					<p className="mt-2">The token stays on your computer: it's kept in memory only while deleting, never saved to disk.</p>
					<p className="mt-1">
						Data folder (ticks, deletion log): <code className="rounded bg-muted px-1 select-all">{dataDir}</code>
					</p>
				</CollapsibleContent>
			</Collapsible>

			{showProgress && (
				<div className="grid gap-1.5">
					<div className={cn("text-sm", error && "text-destructive")}>{status}</div>
					<Progress value={pct} className="h-1.5 [&>[data-slot=progress-indicator]]:bg-destructive" />
					{!!job?.log.length && (
						<Collapsible defaultOpen className="text-xs text-muted-foreground">
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
			)}
		</div>
	);
}
