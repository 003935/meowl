import { SquareIcon } from "lucide-react";
import type { DownloadProgress as Job } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

function formatBytes(n: number) {
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
	if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
	return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// Slim bar above the footer: how the running (or just finished) download is going.
export function DownloadProgress({ progress: p, onStop }: { progress: Job; onStop: () => void }) {
	const done = p.downloaded + p.skipped + p.failed;
	const lastFailure = p.log.findLast((line) => line.includes("FAILED"));
	return (
		<div className="flex flex-col gap-1.5 border-t bg-muted/30 px-5 py-2 text-sm">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<span className="font-medium">
					{p.running ? (p.stopping ? "Stopping…" : "Downloading…") : p.stopped ? "Stopped" : p.error ? "Download failed" : "Finished"}
				</span>
				<span className="text-xs text-muted-foreground tabular-nums">
					{done.toLocaleString()} / {p.total.toLocaleString()} · saved {p.downloaded.toLocaleString()} · already had {p.skipped.toLocaleString()} · failed {p.failed.toLocaleString()} · {formatBytes(p.bytes)}
				</span>
				{p.running && (
					<Button size="sm" variant="outline" className="ml-auto" onClick={onStop} disabled={p.stopping}>
						<SquareIcon data-icon="inline-start" /> Stop
					</Button>
				)}
			</div>
			<Progress value={p.total ? (done / p.total) * 100 : 0} />
			{p.error && <p className="text-xs text-destructive">{p.error}</p>}
			{lastFailure && <p className="truncate text-xs text-muted-foreground" title={lastFailure}>{lastFailure}. Failed files stay ticked, so you can try them again.</p>}
		</div>
	);
}
