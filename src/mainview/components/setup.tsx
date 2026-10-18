import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadIcon, FolderOpenIcon, Loader2Icon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import type { AppState, FetchProgress } from "../../shared/types";
import { api } from "@/lib/api";
import logo from "@/assets/meowl.png";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TokenHelp } from "@/components/token-help";

type Props = {
	state: AppState;
	onImported: () => void;
	onCancel?: () => void;
};

// First run (or the folder button): bring in your posts, from the archive or straight from X.
export function Setup({ state, onImported, onCancel }: Props) {
	return (
		<div className="grid min-h-dvh place-items-center p-6">
			<Card className="w-full max-w-xl [--card-spacing:--spacing(7)]">
				<CardHeader>
					<div className="flex items-center gap-3">
						<img src={logo} alt="" className="h-10 w-auto" />
						<CardTitle className="text-3xl font-bold tracking-tight">Meowl Delete</CardTitle>
					</div>
				</CardHeader>
				<Tabs defaultValue={state.source === "x" ? "x" : "archive"} className="gap-(--card-spacing)">
					<div className="px-(--card-spacing)">
						<TabsList className="w-full">
							<TabsTrigger value="archive"><FolderOpenIcon /> Archive</TabsTrigger>
							<TabsTrigger value="x"><DownloadIcon /> Load from X</TabsTrigger>
						</TabsList>
					</div>
					<TabsContent value="archive" className="flex flex-col gap-(--card-spacing)">
						<FromArchive state={state} onImported={onImported} onCancel={onCancel} />
					</TabsContent>
					<TabsContent value="x" className="flex flex-col gap-(--card-spacing)">
						<LoadFromX onLoaded={onImported} onCancel={onCancel} />
					</TabsContent>
				</Tabs>
			</Card>
		</div>
	);
}

// Pick the unzipped archive folder.
function FromArchive({ state, onImported, onCancel }: Props) {
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
		<>
			<CardContent className="grid gap-6">
				<div className="grid gap-3 text-sm leading-relaxed text-muted-foreground">
					<p>Your X archive has everything you've ever posted:</p>
					<ol className="ml-5 list-decimal space-y-2">
						<li>On x.com, go to <b>Settings → Your account → Download an archive of your data</b> and request it.</li>
						<li>X will let you know when it's ready (this can take a day or so). Download it and unzip it.</li>
						<li>Pick the unzipped folder below, then tick the tweets you want gone.</li>
					</ol>
				</div>
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
					{state.imported && state.source !== "x" ? "Re-import" : "Import archive"}
				</Button>
			</CardFooter>
		</>
	);
}

// No archive: load your recent posts straight from X with your auth_token.
function LoadFromX({ onLoaded, onCancel }: { onLoaded: () => void; onCancel?: () => void }) {
	const [token, setToken] = useState("");
	const [saved, setSaved] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [progress, setProgress] = useState<FetchProgress | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

	// only shown if you open this screen while a load is still going; the viewer shows it otherwise
	const poll = useCallback(async () => {
		clearTimeout(timer.current);
		const p = await api.fetchProgress().catch(() => null);
		setProgress(p);
		if (p?.running) timer.current = setTimeout(poll, 1000);
	}, []);

	useEffect(() => {
		poll();
		api.tokenSaved().then(setSaved, () => {});
		return () => clearTimeout(timer.current);
	}, [poll]);

	async function start() {
		setBusy(true);
		setError(null);
		try {
			await api.startFetch(saved ? null : token.trim());
			setToken("");
			onLoaded(); // straight to the viewer; posts fill in there as they load
		} catch (e) {
			setError((e as Error).message);
			setSaved(await api.tokenSaved().catch(() => false)); // a rejected saved token is forgotten
		} finally {
			setBusy(false);
		}
	}

	const running = !!progress?.running;
	return (
		<>
			<CardContent className="grid gap-4">
				<p className="text-sm leading-relaxed text-muted-foreground">
					No archive? Load your posts straight from your profile using your auth_token.
				</p>
				{running ? (
					<div className="flex items-center gap-3 text-sm">
						<Loader2Icon className="size-4 animate-spin text-muted-foreground" />
						<span className="flex-1">
							{progress.stopping ? "Stopping… " : "Loading… "}
							{progress.fetched.toLocaleString()} posts{progress.username && ` from @${progress.username}`}
							{progress.waiting > 0 && ` · rate limited, waiting ${progress.waiting}s`}
						</span>
						<Button variant="outline" size="sm" onClick={() => api.stopFetch().then(poll)} disabled={progress.stopping}>
							<SquareIcon data-icon="inline-start" /> Stop
						</Button>
					</div>
				) : saved ? (
					<p className="text-sm">Using the auth_token you entered earlier.</p>
				) : (
					<form className="grid gap-2.5" onSubmit={(e) => { e.preventDefault(); if (token.trim()) start(); }}>
						<Label htmlFor="load-token">auth_token</Label>
						<Input
							id="load-token"
							type="password"
							className="font-mono text-xs"
							placeholder="Paste your auth_token"
							autoComplete="off"
							spellCheck={false}
							value={token}
							onChange={(e) => setToken(e.target.value)}
						/>
						<TokenHelp />
					</form>
				)}
				{error && (
					<Alert variant="destructive">
						<AlertTitle>Couldn't load from X</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
			</CardContent>
			<CardFooter className="justify-end gap-2">
				{onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
				<Button onClick={start} disabled={running || busy || (!saved && !token.trim())}>
					{busy && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
					{busy ? "Logging in…" : "Load from X"}
				</Button>
			</CardFooter>
		</>
	);
}
