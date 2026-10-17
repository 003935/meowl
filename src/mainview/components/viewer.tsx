import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FolderCogIcon, Loader2Icon, PanelTopCloseIcon, PanelTopOpenIcon, SearchIcon } from "lucide-react";
import type { AppState, Archive, Kind, Progress } from "../../shared/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TweetColumn } from "@/components/tweet-column";
import { DeletePanel } from "@/components/delete-panel";
import { useConfirm } from "@/components/confirm-dialog";

const KINDS: { kind: Kind; title: string }[] = [
	{ kind: "tweets", title: "Tweets" },
	{ kind: "replies", title: "Replies" },
	{ kind: "retweets", title: "Retweets" },
];

// date inputs are "YYYY-MM-DD"; interpret in local time to match the dates shown
const isoDay = (ts: number) => {
	const d = new Date(ts);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const PANEL_KEY = "delPanelHidden";
const readPanelHidden = () => {
	try { return localStorage.getItem(PANEL_KEY) === "1"; } catch { return false; }
};

export function Viewer({ state, onOpenSetup }: { state: AppState; onOpenSetup: () => void }) {
	const [data, setData] = useState<Archive | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [deleted, setDeleted] = useState<Set<string>>(new Set());
	const [saveState, setSaveState] = useState("saved");
	const [query, setQuery] = useState("");
	const [order, setOrder] = useState<"asc" | "desc">("asc");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [panelHidden, setPanelHidden] = useState(readPanelHidden);
	const [job, setJob] = useState<Progress | null>(null);
	const [startError, setStartError] = useState<string | null>(null);
	const [confirmDialog, confirm] = useConfirm();
	const lastClicked = useRef<Partial<Record<Kind, string>>>({});
	const dirty = useRef(false);

	// ---- load ----
	useEffect(() => {
		Promise.all([api.tweets(), api.selection().catch(() => []), api.deleted().catch(() => [])]).then(
			([d, sel, del]) => {
				const gone = new Set(del);
				setData(d);
				setDeleted(gone);
				setSelected(new Set(sel.filter((id) => !gone.has(id))));
				poll(); // pick up a run that's already in progress
			},
			(e) => setLoadError(e.message),
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// ---- autosave ticks ----
	useEffect(() => {
		if (!dirty.current) return;
		setSaveState("saving…");
		const t = setTimeout(() => {
			api.saveSelection([...selected]).then(() => setSaveState("saved"), () => setSaveState("save failed"));
		}, 300);
		return () => clearTimeout(t);
	}, [selected]);

	const update = useCallback((fn: (s: Set<string>) => void) => {
		dirty.current = true;
		setSelected((prev) => {
			const next = new Set(prev);
			fn(next);
			return next;
		});
	}, []);

	// ---- filtering ----
	const term = useDeferredValue(query.trim().toLowerCase());
	const lists = useMemo(() => {
		const out = { tweets: [], replies: [], retweets: [] } as Archive;
		if (!data) return out;
		const lo = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
		const hi = to ? new Date(`${to}T00:00:00`).getTime() + 86_400_000 : Infinity; // inclusive end day
		for (const { kind } of KINDS) {
			out[kind] = data[kind]
				.filter((t) => t.ts >= lo && t.ts < hi && (!term || t.text.toLowerCase().includes(term)))
				.sort((a, b) => (order === "asc" ? a.ts - b.ts : b.ts - a.ts));
		}
		return out;
	}, [data, term, order, from, to]);

	const range = useMemo(() => {
		let min = Infinity, max = -Infinity;
		for (const list of Object.values(data ?? {})) for (const t of list) { if (t.ts < min) min = t.ts; if (t.ts > max) max = t.ts; }
		return min <= max ? { min: isoDay(min), max: isoDay(max) } : {};
	}, [data]);

	function setDates(f: string, t: string) {
		if (f && t && f > t) [f, t] = [t, f];
		setFrom(f);
		setTo(t);
	}

	// ---- ticking ----
	const listsRef = useRef(lists);
	listsRef.current = lists;
	const deletedRef = useRef(deleted);
	deletedRef.current = deleted;

	const makeToggle = useCallback(
		(kind: Kind) => (id: string, shift: boolean) => {
			if (deletedRef.current.has(id)) return;
			update((s) => {
				const on = !s.has(id);
				const ids = listsRef.current[kind].map((t) => t.id);
				const prev = lastClicked.current[kind];
				const a = prev ? ids.indexOf(prev) : -1, b = ids.indexOf(id);
				// shift-click: apply to the whole range since the last click in this column
				const range = shift && a >= 0 && b >= 0 ? ids.slice(Math.min(a, b), Math.max(a, b) + 1) : [id];
				for (const x of range) if (!deletedRef.current.has(x)) on ? s.add(x) : s.delete(x);
			});
			lastClicked.current[kind] = id;
		},
		[update],
	);
	const toggles = useMemo(() => Object.fromEntries(KINDS.map(({ kind }) => [kind, makeToggle(kind)])) as Record<Kind, ReturnType<typeof makeToggle>>, [makeToggle]);

	async function tickAll(kind: Kind) {
		const list = lists[kind];
		if (list.length > 50 && !(await confirm({ title: `Tick all ${list.length.toLocaleString()} shown ${kind}?`, description: "They'll be added to what's marked for deletion.", confirm: "Tick all" }))) return;
		update((s) => { for (const t of list) if (!deleted.has(t.id)) s.add(t.id); });
	}
	const untickAll = (kind: Kind) => update((s) => { for (const t of lists[kind]) s.delete(t.id); });

	// ---- deleting ----
	const pollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const poll = useCallback(async () => {
		clearTimeout(pollTimer.current);
		const [p, del] = await Promise.all([api.progress(), api.deleted()]).catch(() => [null, null] as const);
		if (!p || !del) return;
		setJob(p);
		setDeleted((prev) => (del.length === prev.size ? prev : new Set(del)));
		// the server already dropped deleted ids from selected.json
		setSelected((prev) => {
			const gone = del.filter((id) => prev.has(id));
			if (!gone.length) return prev;
			const next = new Set(prev);
			for (const id of gone) next.delete(id);
			return next;
		});
		if (p.running) pollTimer.current = setTimeout(poll, 1000);
	}, []);
	useEffect(() => () => clearTimeout(pollTimer.current), []);

	async function startDelete(token: string) {
		const ids = [...selected];
		const kindOf = new Map<string, Kind>();
		for (const { kind } of KINDS) for (const t of data![kind]) kindOf.set(t.id, kind);
		const n = { tweets: 0, replies: 0, retweets: 0 };
		for (const id of ids) n[kindOf.get(id) ?? "tweets"]++;
		const ok = await confirm({
			title: `Permanently delete ${ids.length.toLocaleString()} from X?`,
			description: (
				<>
					<p>{n.tweets} tweets · {n.replies} replies · {n.retweets} retweets</p>
					<p className="mt-2 font-medium text-destructive">This cannot be undone.</p>
				</>
			),
			confirm: "Delete permanently",
			destructive: true,
		});
		if (!ok) return;

		setStartError(null);
		try {
			await api.saveSelection(ids); // make sure the server has the latest ticks first
			setSaveState("saved");
			await api.startDelete(token);
		} catch (e) {
			setStartError((e as Error).message);
			return;
		}
		poll();
	}

	function togglePanel() {
		setPanelHidden((h) => {
			try { localStorage.setItem(PANEL_KEY, h ? "0" : "1"); } catch {}
			return !h;
		});
	}

	if (loadError) {
		return (
			<div className="grid h-dvh place-items-center p-6 text-center text-sm">
				<div className="grid gap-3">
					<p className="text-destructive">Couldn't load the imported archive: {loadError}</p>
					<Button variant="outline" onClick={onOpenSetup}>Re-import archive</Button>
				</div>
			</div>
		);
	}
	if (!data) {
		return <div className="grid h-dvh place-items-center"><Loader2Icon className="size-6 animate-spin text-muted-foreground" /></div>;
	}

	const running = !!job?.running;
	return (
		<div className="flex h-dvh flex-col">
			<header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
				<h1 className="mr-2 text-base font-semibold">Tweet Archive</h1>
				<div className="relative min-w-48 flex-1">
					<SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input type="search" className="pl-8" placeholder="Search all columns…" value={query} onChange={(e) => setQuery(e.target.value)} />
				</div>
				<Select value={order} onValueChange={(v) => setOrder(v as "asc" | "desc")}>
					<SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
					<SelectContent>
						<SelectItem value="asc">Oldest first</SelectItem>
						<SelectItem value="desc">Newest first</SelectItem>
					</SelectContent>
				</Select>
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					From
					<Input type="date" aria-label="From date" className={cn("w-fit", from && "border-ring")} min={range.min} max={range.max} value={from} onChange={(e) => setDates(e.target.value, to)} />
					to
					<Input type="date" aria-label="To date" className={cn("w-fit", to && "border-ring")} min={range.min} max={range.max} value={to} onChange={(e) => setDates(from, e.target.value)} />
					<Button size="sm" variant="ghost" disabled={!from && !to} onClick={() => setDates("", "")}>All dates</Button>
				</div>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<Badge variant={selected.size ? "destructive" : "secondary"}>{selected.size.toLocaleString()}</Badge>
					marked for deletion · {saveState}
				</div>
				<Button size="sm" variant="outline" onClick={togglePanel} aria-expanded={!panelHidden}>
					{panelHidden ? <PanelTopOpenIcon data-icon="inline-start" /> : <PanelTopCloseIcon data-icon="inline-start" />}
					{panelHidden ? `Show delete panel${running ? " (deleting…)" : ""}` : "Hide delete panel"}
				</Button>
				<Button size="sm" variant="ghost" onClick={onOpenSetup} disabled={running} title="Change archive folder or cutoff date">
					<FolderCogIcon data-icon="inline-start" /> Archive
				</Button>
			</header>

			{!panelHidden && (
				<DeletePanel
					ticked={selected.size}
					job={job}
					startError={startError}
					dataDir={state.dataDir}
					onDelete={startDelete}
					onStop={() => api.stop().then(poll)}
				/>
			)}

			<div className="grid min-h-0 flex-1 grid-rows-3 lg:grid-cols-3 lg:grid-rows-1">
				{KINDS.map(({ kind, title }) => (
					<TweetColumn
						key={kind}
						title={title}
						list={lists[kind]}
						selected={selected}
						deleted={deleted}
						onToggle={toggles[kind]}
						onTickAll={() => tickAll(kind)}
						onUntickAll={() => untickAll(kind)}
					/>
				))}
			</div>
			{confirmDialog}
		</div>
	);
}
