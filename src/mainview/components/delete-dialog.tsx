import { useState } from "react";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import type { Kind } from "../../shared/types";
import { api } from "@/lib/api";
import { KINDS } from "@/lib/kinds";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { code, TokenHelp } from "@/components/token-help";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	counts: Record<Kind, number>;
	dataDir: string;
	/** Starts the deletion (null = the token remembered this session); rejects with a readable message if it can't. */
	onDelete: (token: string | null) => Promise<void>;
};

// Asks for the auth_token when you press Delete, with how-to-get-it instructions.
// Once X has accepted a token, the app remembers it until it quits and this is
// just a confirmation. If X rejects the token, it asks for the right one.
export function DeleteDialog({ open, onOpenChange, counts, dataDir, onDelete }: Props) {
	const [token, setToken] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const total = counts.tweets + counts.replies + counts.retweets;

	// start fresh each time it opens, and ask the app whether it has a token from earlier
	const [wasOpen, setWasOpen] = useState(open);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setToken("");
			setError(null);
			api.tokenSaved().then(setSaved, () => setSaved(false));
		}
	}
	const canSubmit = !busy && (saved || !!token.trim());

	async function submit() {
		setBusy(true);
		setError(null);
		try {
			await onDelete(saved ? null : token.trim());
			setToken("");
			onOpenChange(false);
		} catch (e) {
			setError((e as Error).message);
			setToken("");
			setSaved(await api.tokenSaved().catch(() => false)); // a rejected saved token is forgotten
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Delete {total.toLocaleString()} from X?</DialogTitle>
					<DialogDescription asChild>
						<div className="grid gap-2">
							<div className="flex flex-wrap gap-x-4 gap-y-1">
								{KINDS.map(({ kind, title, one, Icon }) => (
									<span key={kind} className="inline-flex items-center gap-1.5">
										<Icon className="size-3.5" /> {counts[kind].toLocaleString()} {counts[kind] === 1 ? one : title.toLowerCase()}
									</span>
								))}
							</div>
						</div>
					</DialogDescription>
				</DialogHeader>

				{!saved && (
					<form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); if (canSubmit) submit(); }}>
						<Label htmlFor="auth-token">Paste your auth_token</Label>
						<Input
							id="auth-token"
							type="password"
							className="font-mono text-xs"
							placeholder="auth_token"
							autoComplete="off"
							spellCheck={false}
							autoFocus
							value={token}
							onChange={(e) => setToken(e.target.value)}
						/>
					</form>
				)}

				{!saved && (
					<TokenHelp>
						<p className="mt-2">
							Data folder (ticks, deletion log): <code className={`${code} select-all`}>{dataDir}</code>
						</p>
					</TokenHelp>
				)}

				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
					<Button variant="destructive" disabled={!canSubmit} onClick={submit}>
						{busy ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <Trash2Icon data-icon="inline-start" />}
						{busy ? "Logging in…" : "Delete"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
