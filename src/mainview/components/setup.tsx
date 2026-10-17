import { useState } from "react";
import { FolderOpenIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import type { AppState } from "../../shared/types";
import { api } from "@/lib/api";
import logo from "@/assets/meowl.png";
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

// First run (or "Change archive"): pick the unzipped archive folder.
export function Setup({ state, onImported, onCancel }: Props) {
	const [archivePath, setArchivePath] = useState(state.archivePath ?? "");
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
			const r = await api.importArchive(archivePath.trim());
			toast.success(`Imported ${r.counts.tweets} tweets, ${r.counts.replies} replies, ${r.counts.retweets} retweets`);
			onImported();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="grid min-h-dvh place-items-center p-6">
			<Card className="w-full max-w-xl [--card-spacing:--spacing(7)]">
				<CardHeader className="gap-5">
					<div className="flex items-center gap-3">
						<img src={logo} alt="" className="h-10 w-auto" />
						<CardTitle className="text-3xl font-bold tracking-tight">Meowl Delete</CardTitle>
					</div>
					<CardDescription className="grid gap-3 leading-relaxed">
						<p>To delete your tweets, you'll need your X archive first:</p>
						<ol className="ml-5 list-decimal space-y-2">
							<li>On x.com, go to <b>Settings → Your account → Download an archive of your data</b> and request it.</li>
							<li>X will let you know when it's ready (this can take a day or so). Download it and unzip it.</li>
							<li>Pick the unzipped folder below, then tick the tweets you want gone.</li>
						</ol>
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-6">
					<div className="grid gap-2.5">
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
					{error && (
						<Alert variant="destructive">
							<AlertTitle>Couldn't import</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</CardContent>
				<CardFooter className="justify-end gap-2">
					{onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
					<Button onClick={importNow} disabled={busy || !archivePath.trim()}>
						{busy && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
						{state.imported ? "Re-import" : "Import archive"}
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
