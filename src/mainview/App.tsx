import { useCallback, useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import type { AppState } from "../shared/types";
import { api } from "@/lib/api";
import { Setup } from "@/components/setup";
import { Viewer } from "@/components/viewer";

export default function App() {
	const [state, setState] = useState<AppState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [setup, setSetup] = useState(false);
	const [imports, setImports] = useState(0);

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
	if (!state.imported || setup) {
		return (
			<Setup
				state={state}
				onCancel={state.imported ? () => setSetup(false) : undefined}
				onImported={() => { setSetup(false); setImports((n) => n + 1); refresh(); }}
			/>
		);
	}
	// key: remount (and reload tweets) after a re-import
	return <Viewer key={imports} state={state} onOpenSetup={() => setSetup(true)} />;
}
