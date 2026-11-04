import { useCallback, useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import type { AppState } from "../shared/types";
import { api } from "@/lib/api";
import { Setup } from "@/components/setup";
import { Viewer } from "@/components/viewer";
import { MediaApp } from "@/components/media-app";

export default function App() {
	const [state, setState] = useState<AppState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [setup, setSetup] = useState(false);
	const [imports, setImports] = useState(0);
	// "Download media" stays mounted once opened, so going back and forth keeps its ticks
	const [mode, setMode] = useState<"delete" | "media">("delete");
	const [mediaOpened, setMediaOpened] = useState(false);
	const openMedia = useCallback(() => { setMediaOpened(true); setMode("media"); }, []);

	const refresh = useCallback(() => {
		api.state().then(setState, (e) => setError(String(e.message)));
	}, []);
	useEffect(refresh, [refresh]);

	if (error) {
		return <div className="grid h-dvh place-items-center p-6 text-sm text-destructive">Couldn't reach the app's server: {error}</div>;
	}
	if (!state) {
		return <div className="grid h-dvh place-items-center"><Loader2Icon className="size-6 animate-spin text-muted-foreground" /></div>;
	}
	const main = !state.imported || setup ? (
		<Setup
			state={state}
			onCancel={state.imported ? () => setSetup(false) : undefined}
			onImported={() => { setSetup(false); setImports((n) => n + 1); refresh(); }}
			onOpenMedia={openMedia}
		/>
	) : (
		// key: remount (and reload tweets) after a re-import
		<Viewer key={imports} state={state} onOpenSetup={() => setSetup(true)} onOpenMedia={openMedia} />
	);
	return (
		<>
			<div className={mode === "delete" ? undefined : "hidden"}>{main}</div>
			{mediaOpened && (
				<div className={mode === "media" ? undefined : "hidden"}>
					<MediaApp onBack={() => setMode("delete")} />
				</div>
			)}
		</>
	);
}
