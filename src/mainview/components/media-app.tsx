import { useCallback, useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import type { MediaState, ScanProgress } from "../../shared/types";
import { api } from "@/lib/api";
import { MediaSetup } from "@/components/media-setup";
import { MediaViewer } from "@/components/media-viewer";

// "Download media": pick an account, then tick and save its photos, videos and GIFs.
export function MediaApp({ onBack }: { onBack: () => void }) {
	const [state, setState] = useState<MediaState | null>(null);
	const [scan, setScan] = useState<ScanProgress | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [setup, setSetup] = useState(false); // "Change account" goes back to the form

	const refresh = useCallback(() => {
		api.media.state().then(setState, (e) => setError(String(e.message)));
	}, []);
	const refreshScan = useCallback(() => api.media.scanProgress().then(setScan, (e) => setError(String(e.message))), []);

	useEffect(() => {
		refresh();
		refreshScan();
	}, [refresh, refreshScan]);

	if (error) {
		return <div className="grid h-dvh place-items-center p-6 text-sm text-destructive">Couldn't reach the app's server: {error}</div>;
	}
	if (!state || !scan) {
		return <div className="grid h-dvh place-items-center"><Loader2Icon className="size-6 animate-spin text-muted-foreground" /></div>;
	}
	const showSetup = !scan.username || setup;
	return (
		<>
			{showSetup && (
				<MediaSetup
					onCancel={scan.username ? () => setSetup(false) : onBack}
					onStarted={() => { setSetup(false); refreshScan(); }}
				/>
			)}
			{/* hidden, not unmounted, so cancelling "Change account" keeps your ticks; key: start fresh for a new scan */}
			{scan.username && (
				<div className={showSetup ? "hidden" : undefined}>
					<MediaViewer key={scan.id} outDir={state.outDir} onFolderChanged={refresh} onOpenSetup={() => setSetup(true)} onBack={onBack} />
				</div>
			)}
		</>
	);
}
