import { useEffect, useState } from "react";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { api } from "@/lib/api";
import logo from "@/assets/meowl.png";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TokenHelp } from "@/components/token-help";

type Props = {
	onStarted: () => void;
	onCancel: () => void;
};

// "Download media" (or "Change account"): whose media to look through, and your auth_token.
export function MediaSetup({ onStarted, onCancel }: Props) {
	const [username, setUsername] = useState("");
	const [token, setToken] = useState("");
	const [saved, setSaved] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		api.tokenSaved().then(setSaved, () => {});
	}, []);

	async function start() {
		setBusy(true);
		setError(null);
		try {
			await api.media.startScan(username.trim(), saved ? null : token.trim());
			setToken("");
			onStarted(); // straight to the viewer; media fills in there as it's found
		} catch (e) {
			setError((e as Error).message);
			setSaved(await api.tokenSaved().catch(() => false)); // a rejected saved token is forgotten
		} finally {
			setBusy(false);
		}
	}

	const ready = !busy && !!username.trim() && (saved || !!token.trim());
	return (
		<div className="grid min-h-dvh place-items-center p-6">
			<Card className="w-full max-w-xl [--card-spacing:--spacing(7)]">
				<CardHeader>
					<div className="flex items-center gap-3">
						<img src={logo} alt="" className="h-10 w-auto" />
						<CardTitle className="text-3xl font-bold tracking-tight">Download media</CardTitle>
					</div>
				</CardHeader>
				<form className="flex flex-col gap-(--card-spacing)" onSubmit={(e) => { e.preventDefault(); if (ready) start(); }}>
					<CardContent className="grid gap-6">
						<div className="grid gap-2.5">
							<Label htmlFor="username">Account</Label>
							<Input
								id="username"
								placeholder="@username or a profile link"
								autoComplete="off"
								spellCheck={false}
								autoFocus
								value={username}
								onChange={(e) => setUsername(e.target.value)}
							/>
						</div>
						{saved ? (
							<p className="text-sm">
								Using the auth_token you entered earlier.{" "}
								<button type="button" className="text-sky-600 hover:underline dark:text-sky-400" onClick={() => api.forgetToken().then(() => setSaved(false))}>
									Use a different one
								</button>
							</p>
						) : (
							<div className="grid gap-2.5">
								<Label htmlFor="token">auth_token</Label>
								<Input
									id="token"
									type="password"
									className="font-mono text-xs"
									placeholder="Paste your auth_token"
									autoComplete="off"
									spellCheck={false}
									value={token}
									onChange={(e) => setToken(e.target.value)}
								/>
								<TokenHelp />
							</div>
						)}
						{error && (
							<Alert variant="destructive">
								<AlertTitle>Couldn't load that account</AlertTitle>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
					</CardContent>
					<CardFooter className="justify-end gap-2">
						<Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
						<Button type="submit" disabled={!ready}>
							{busy ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <SearchIcon data-icon="inline-start" />}
							{busy ? "Logging in…" : "Load media"}
						</Button>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
