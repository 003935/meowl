import { useCallback, useRef, useState, type ReactNode } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Ask = { title: string; description: ReactNode; confirm: string; destructive?: boolean };

/** `const [dialog, ask] = useConfirm()` — render `dialog`, then `if (await ask({...}))`. */
export function useConfirm() {
	const [ask, setAsk] = useState<Ask | null>(null);
	const resolve = useRef<(ok: boolean) => void>(() => {});

	const open = useCallback((a: Ask) => {
		setAsk(a);
		return new Promise<boolean>((r) => (resolve.current = r));
	}, []);

	const close = (ok: boolean) => {
		resolve.current(ok);
		setAsk(null);
	};

	const dialog = (
		<AlertDialog open={!!ask} onOpenChange={(o) => !o && close(false)}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{ask?.title}</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div>{ask?.description}</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction variant={ask?.destructive ? "destructive" : "default"} onClick={() => close(true)}>
						{ask?.confirm}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);

	return [dialog, open] as const;
}
