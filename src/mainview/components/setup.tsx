import { useState } from "react";
import { FolderOpenIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import type { AppState } from "../../shared/types";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Props = {
	state: AppState;
	onImported: () => void;
	onCancel?: () => void;
};

// First run (or "Change archive"): pick the unzipped archive folder and a cutoff date.
export function Setup({ state, onImported, onCancel }: Props) {
	const [archivePath, setArchivePath] = useState(state.archivePath ?? "");
	const [cutoff, setCutoff] = useState(state.cutoff);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function pick() {
		try {
			const { path } = await api.pickFolder();
			if (path) setArchivePath(path);
		} catch (e) {
			setError((e as Error).message);
		}
	}

	async function importNow() {
		setBusy(true);
		setError(null);
		try {
			const r = await api.importArchive(archivePath.trim(), cutoff);
			toast.success(`Imported ${r.counts.tweets} tweets, ${r.counts.replies} replies, ${r.counts.retweets} retweets`, {
				description: r.afterCutoff ? `${r.afterCutoff} posted on or after ${cutoff} were left out.` : undefined,
			});
			onImported();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="grid min-h-dvh place-items-center p-6">
			<Card className="w-full max-w-xl">
				<CardHeader>
					<CardTitle className="text-xl">Tweet Deleter</CardTitle>
					<CardDescription>
						Browse your X archive in three columns (tweets, replies, retweets), tick what you want gone, and bulk-delete it.
						Download your archive from x.com → Settings → Your account → Download an archive, then unzip it.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-5">
					<div className="grid gap-2">
						<Label htmlFor="archive">Archive folder</Label>
						<div className="flex gap-2">
							<Input
								id="archive"
								value={archivePath}
								onChange={(e) => setArchivePath(e.target.value)}
								placeholder="The unzipped folder that contains data/tweets.js"
								spellCheck={false}
							/>
							<Button variant="outline" onClick={pick}>
								<FolderOpenIcon data-icon="inline-start" /> Browse…
							</Button>
						</div>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="cutoff">Only list posts before</Label>
						<Input id="cutoff" type="date" className="w-fit" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
						<p className="text-xs text-muted-foreground">Anything posted on or after this date is left out of the lists, so it can't be ticked.</p>
					</div>
					{error && (
						<Alert variant="destructive">
							<AlertTitle>Couldn't import</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</CardContent>
				<CardFooter className="justify-end gap-2">
					{onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
					<Button onClick={importNow} disabled={busy || !archivePath.trim() || !cutoff}>
						{busy && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
						{state.imported ? "Re-import" : "Import archive"}
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
