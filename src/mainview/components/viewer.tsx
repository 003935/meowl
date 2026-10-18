import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FolderCogIcon, ListChecksIcon, Loader2Icon, SearchIcon, SlidersHorizontalIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import type { AppState, Archive, FetchProgress as FetchProgressState, Kind, Progress } from "../../shared/types";
import { api } from "@/lib/api";
import logo from "@/assets/meowl.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TweetColumn } from "@/components/tweet-column";
import { DeleteDialog } from "@/components/delete-dialog";
import { DeleteProgress } from "@/components/delete-progress";
import { FetchProgress } from "@/components/fetch-progress";
import { FiltersDialog } from "@/components/filters-dialog";
import { ReviewPanel } from "@/components/review-panel";
import { SortMenu, type Order } from "@/components/sort-menu";
import { KINDS } from "@/lib/kinds";
import { EMPTY_FILTERS, activeFilterCount, makeMatcher, type Filters } from "@/lib/filters";

const REVIEW_KEY = "reviewPanelOpen";
const readReviewOpen = () => {
	try { return localStorage.getItem(REVIEW_KEY) === "1"; } catch { return false; }
};

export function Viewer({ state, onOpenSetup }: { state: AppState; onOpenSetup: () => void }) {
	const [data, setData] = useState<Archive | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [deleted, setDeleted] = useState<Set<string>>(new Set());
	const [query, setQuery] = useState("");
	const [order, setOrder] = useState<Order>("asc");
	const [popular, setPopular] = useState(false);
	const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [reviewOpen, setReviewOpen] = useState(readReviewOpen);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [progressDismissed, setProgressDismissed] = useState(false);
	const [job, setJob] = useState<Progress | null>(null);
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
				pollFetch();
			},
			(e) => setLoadError(e.message),
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// ---- "Load from X" still running: show posts as they arrive ----
	const [fetching, setFetching] = useState<FetchProgressState | null>(null);
	const fetchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const lastFetch = useRef<FetchProgressState | null>(null); // previous poll, null before the first
	const pollFetch = useCallback(async () => {
		clearTimeout(fetchTimer.current);
		const p = await api.fetchProgress().catch(() => null);
		if (!p) return;
		const prev = lastFetch.current;
		lastFetch.current = p;
		setFetching(p.running ? p : null);
		// X hands back newest first, each page older than the last: sort newest first while
		// loading so new pages land at the bottom, out of sight, instead of on top of what you're reading
		if (p.running && !prev?.running) { setOrder("desc"); setPopular(false); }
		// a new page landed, or it just finished: reload the columns
		// (first poll: the posts loaded on open may already be behind)
		if (prev ? p.fetched !== prev.fetched || (prev.running && !p.running) : p.running) api.tweets().then(setData, () => {});
		if (p.running) { fetchTimer.current = setTimeout(pollFetch, 1500); return; }
		if (!prev?.running) return;
		if (p.error) toast.error(`Stopped loading after ${p.fetched.toLocaleString()} posts`, { description: p.error });
		else if (p.counts) toast.success(`Loaded ${p.counts.tweets} tweets, ${p.counts.replies} replies, ${p.counts.retweets} retweets${p.username ? ` from @${p.username}` : ""}`);
	}, []);
	useEffect(() => () => clearTimeout(fetchTimer.current), []);

	// ---- autosave ticks ----
	useEffect(() => {
		if (!dirty.current) return;
		const t = setTimeout(() => {
			api.saveSelection([...selected]).catch(() => toast.error("Couldn’t save your ticks", { id: "save", description: "They’ll be saved with your next change." }));
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

	// Tweets already deleted from X are dropped everywhere: columns, counts, the review panel.
	const live = useMemo(() => {
		if (!data) return null;
		const out = {} as Archive;
		for (const { kind } of KINDS) out[kind] = deleted.size ? data[kind].filter((t) => !deleted.has(t.id)) : data[kind];
		return out;
	}, [data, deleted]);

	// ---- filtering ----
	const term = useDeferredValue(query);
	const lists = useMemo(() => {
		const out = { tweets: [], replies: [], retweets: [] } as Archive;
		if (!live) return out;
		const matches = makeMatcher(filters, term);
		for (const { kind } of KINDS) {
			out[kind] = live[kind].filter(matches).sort((a, b) => (popular && b.likes - a.likes) || (order === "asc" ? a.ts - b.ts : b.ts - a.ts));
		}
		return out;
	}, [live, term, order, popular, filters]);
	const filterCount = activeFilterCount(filters);
	// columns jump back to the top when what you're looking at changes, not when more posts load in
	const resetKey = JSON.stringify([term, order, popular, filters]);

	// year range of the archive, for the date pickers
	const years = useMemo(() => {
		let min = Infinity, max = -Infinity;
		for (const list of Object.values(live ?? {})) for (const t of list) { if (t.ts < min) min = t.ts; if (t.ts > max) max = t.ts; }
		const now = new Date().getFullYear();
		return min <= max ? { min: new Date(min).getFullYear(), max: new Date(max).getFullYear() } : { min: 2006, max: now };
	}, [live]);

	// every tweet's like and repost counts, for the Engagement charts in Filters
	const engagement = useMemo(() => {
		const all = live ? [...live.tweets, ...live.replies, ...live.retweets] : [];
		return { likes: all.map((t) => t.likes), reposts: all.map((t) => t.retweets_count) };
	}, [live]);

	function applyFilters(f: Filters) {
		if (f.since && f.until && f.since > f.until) f = { ...f, since: f.until, until: f.since };
		setFilters(f);
	}

	// ---- ticking ----
	const listsRef = useRef(lists);
	listsRef.current = lists;

	const makeToggle = useCallback(
		(kind: Kind) => (id: string, shift: boolean) => {
			update((s) => {
				const on = !s.has(id);
				const ids = listsRef.current[kind].map((t) => t.id);
				const prev = lastClicked.current[kind];
				const a = prev ? ids.indexOf(prev) : -1, b = ids.indexOf(id);
				// shift-click: apply to the whole range since the last click in this column
				const range = shift && a >= 0 && b >= 0 ? ids.slice(Math.min(a, b), Math.max(a, b) + 1) : [id];
				for (const x of range) on ? s.add(x) : s.delete(x);
			});
			lastClicked.current[kind] = id;
		},
		[update],
	);
	const toggles = useMemo(() => Object.fromEntries(KINDS.map(({ kind }) => [kind, makeToggle(kind)])) as Record<Kind, ReturnType<typeof makeToggle>>, [makeToggle]);

	const tickAll = (kind: Kind) => update((s) => { for (const t of lists[kind]) s.add(t.id); });
	const setMany = (ids: string[], on: boolean) => update((s) => { for (const id of ids) on ? s.add(id) : s.delete(id); });
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

	// what's ticked, by kind, for the delete dialog
	const tickedCounts = useMemo(() => {
		const n: Record<Kind, number> = { tweets: 0, replies: 0, retweets: 0 };
		if (live) for (const { kind } of KINDS) for (const t of live[kind]) if (selected.has(t.id)) n[kind]++;
		return n;
	}, [live, selected]);

	// Called by the delete dialog; throws (shown in the dialog) if the run can't start.
	async function startDelete(token: string | null) {
		await api.saveSelection([...selected]); // make sure the server has the latest ticks first
		await api.startDelete(token);
		setProgressDismissed(false);
		poll();
	}

	function showReview(open: boolean) {
		setReviewOpen(open);
		try { localStorage.setItem(REVIEW_KEY, open ? "1" : "0"); } catch {}
	}

	if (loadError) {
		return (
			<div className="grid h-dvh place-items-center p-6 text-center text-sm">
				<div className="grid gap-3">
					<p className="text-destructive">Couldn't load your posts: {loadError}</p>
					<Button variant="outline" onClick={onOpenSetup}>Load them again</Button>
				</div>
			</div>
		);
	}
	if (!live) {
		return <div className="grid h-dvh place-items-center"><Loader2Icon className="size-6 animate-spin text-muted-foreground" /></div>;
	}

	const running = !!job?.running;
	return (
		<div className="flex h-dvh flex-col">
			<header className="flex flex-wrap items-center gap-2.5 border-b px-5 py-3.5">
				<h1 className="mr-3 flex items-center gap-2.5 text-lg font-bold tracking-tight">
					<img src={logo} alt="" className="h-7 w-auto" />
					Meowl Delete
				</h1>
				<div className="relative min-w-48 flex-1">
					<SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input type="search" className="h-9 pl-9" placeholder="Search all columns…" value={query} onChange={(e) => setQuery(e.target.value)} />
				</div>
				<Button variant="ghost" size="icon" onClick={onOpenSetup} disabled={running || !!fetching} title="Change archive, or load from X" aria-label="Change archive, or load from X">
					<FolderCogIcon />
				</Button>
				<div className="flex items-center">
					<Button variant={filterCount ? "default" : "secondary"} className="rounded-full" onClick={() => setFiltersOpen(true)}>
						<SlidersHorizontalIcon data-icon="inline-start" /> Filters
						{filterCount > 0 && <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 tabular-nums">{filterCount}</Badge>}
					</Button>
					{filterCount > 0 && (
						<Button size="icon-sm" variant="ghost" aria-label="Clear filters" title="Clear filters" onClick={() => setFilters(EMPTY_FILTERS)}>
							<XIcon />
						</Button>
					)}
				</div>
				<SortMenu order={order} onOrderChange={setOrder} popular={popular} onPopularChange={setPopular} />
				<Button variant={reviewOpen ? "secondary" : "ghost"} onClick={() => showReview(!reviewOpen)} aria-pressed={reviewOpen} title={reviewOpen ? "Hide Review selected" : "Review selected"}>
					<ListChecksIcon data-icon="inline-start" />
					<Badge variant={selected.size ? "destructive" : "secondary"} className="tabular-nums">{selected.size.toLocaleString()}</Badge>
				</Button>
				<Button variant="destructive" onClick={() => setDeleteOpen(true)} disabled={running || !selected.size} title={running ? "A deletion is running" : selected.size ? "Delete everything ticked from X" : "Tick some tweets first"}>
					{running ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <Trash2Icon data-icon="inline-start" />}
					{running ? "Deleting…" : "Delete"}
				</Button>
			</header>

			{(fetching || state.source === "x") && <FetchProgress fetch={fetching} onStop={() => api.stopFetch().then(pollFetch)} />}
			{job && (job.running || job.log.length > 0) && !progressDismissed && (
				<DeleteProgress job={job} onStop={() => api.stop().then(poll)} onDismiss={() => setProgressDismissed(true)} />
			)}

			<div className="flex min-h-0 flex-1">
				<div className="grid min-h-0 min-w-0 flex-1 grid-rows-3 lg:grid-cols-3 lg:grid-rows-1">
					{KINDS.map(({ kind, title, Icon }) => (
						<TweetColumn
							key={kind}
							title={title}
							Icon={Icon}
							list={lists[kind]}
							yearHeaders={!popular}
							resetKey={resetKey}
							selected={selected}
							onToggle={toggles[kind]}
							onTickAll={() => tickAll(kind)}
							onUntickAll={() => untickAll(kind)}
							onSetMany={setMany}
						/>
					))}
				</div>
				{reviewOpen && (
					<ReviewPanel
						data={live}
						selected={selected}
						onToggle={(id) => update((s) => (s.has(id) ? s.delete(id) : s.add(id)))}
						onClose={() => showReview(false)}
					/>
				)}
			</div>
			<DeleteDialog open={deleteOpen} onOpenChange={setDeleteOpen} counts={tickedCounts} dataDir={state.dataDir} onDelete={startDelete} />
			<FiltersDialog
				open={filtersOpen}
				onOpenChange={setFiltersOpen}
				value={filters}
				onApply={applyFilters}
				engagement={engagement}
				minYear={years.min}
				maxYear={years.max}
			/>
		</div>
	);
}
