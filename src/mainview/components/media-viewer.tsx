import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, CheckIcon, DownloadIcon, FolderOpenIcon, Loader2Icon, MaximizeIcon, PlayIcon, SquareIcon, UserIcon } from "lucide-react";
import type { DownloadProgress as Download, MediaItem, MediaKind, ScanProgress } from "../../shared/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import logo from "@/assets/meowl.png";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DownloadProgress } from "@/components/media-download-progress";
import { Lightbox } from "@/components/media-lightbox";

type Filter = "all" | MediaKind;
const FILTERS: { key: Filter; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "photo", label: "Photos" },
	{ key: "video", label: "Videos" },
	{ key: "gif", label: "GIFs" },
];

export function formatDuration(seconds: number) {
	const s = Math.round(seconds);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type TileProps = {
	item: MediaItem;
	index: number;
	ticked: boolean;
	saved: boolean;
	onTick: (index: number, shift: boolean) => void;
	onOpen: (index: number) => void;
};

// memo: an account can have thousands of tiles, and a tick only changes one
const Tile = memo(function Tile({ item, index, ticked, saved, onTick, onOpen }: TileProps) {
	return (
		<div className={cn(
			"group relative aspect-square overflow-hidden rounded-md bg-muted [contain-intrinsic-size:auto_10rem] [content-visibility:auto]",
			ticked && "ring-2 ring-sky-500 ring-offset-2 ring-offset-background",
		)}>
			<button
				type="button"
				className={cn("size-full", saved ? "cursor-default" : "cursor-pointer")}
				aria-pressed={ticked}
				aria-label={`${saved ? "Already saved: " : ""}${item.name}`}
				onClick={(e) => onTick(index, e.shiftKey)}
			>
				{item.thumb && <img src={item.thumb} alt="" loading="lazy" decoding="async" className={cn("size-full object-cover", saved && "opacity-40")} />}
			</button>
			<span className={cn(
				"pointer-events-none absolute top-1.5 left-1.5 grid size-5 place-items-center rounded border",
				saved ? "border-emerald-500 bg-emerald-500 text-white" : ticked ? "border-sky-500 bg-sky-500 text-white" : "border-white/70 bg-black/40 text-transparent",
			)}>
				<CheckIcon className="size-3.5" />
			</span>
			{item.kind !== "photo" && (
				<span className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[0.7rem] font-medium text-white">
					{item.kind === "gif" ? "GIF" : <><PlayIcon className="size-3 fill-current" />{item.duration ? formatDuration(item.duration) : "Video"}</>}
				</span>
			)}
			<button
				type="button"
				aria-label={`Preview ${item.name}`}
				className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
				onClick={() => onOpen(index)}
			>
				<MaximizeIcon className="size-3.5" />
			</button>
		</div>
	);
});

type Props = {
	outDir: string;
	onFolderChanged: () => void;
	onOpenSetup: () => void;
	onBack: () => void;
};

// The account's media as a grid, filling in as it's found: tick what you want, then download it.
export function MediaViewer({ outDir, onFolderChanged, onOpenSetup, onBack }: Props) {
	const [scan, setScan] = useState<ScanProgress | null>(null);
	const [download, setDownload] = useState<Download | null>(null);
	const [items, setItems] = useState<MediaItem[]>([]);
	const [saved, setSaved] = useState<Set<string>>(new Set());
	const [ticked, setTicked] = useState<Set<string>>(new Set());
	const [filter, setFilter] = useState<Filter>("all");
	const [hideSaved, setHideSaved] = useState(false);
	const [preview, setPreview] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const loaded = useRef(0);
	loaded.current = items.length;

	const poll = useCallback(async () => {
		clearTimeout(timer.current);
		const from = loaded.current;
		const [s, d, more, names] = await Promise.all([api.media.scanProgress(), api.media.downloadProgress(), api.media.items(from), api.media.saved()]).catch(() => [null, null, null, null] as const);
		if (s) setScan(s);
		if (d) setDownload(d);
		if (more?.length) setItems((prev) => (prev.length === from ? [...prev, ...more] : prev));
		if (names) setSaved((prev) => (prev.size === names.length && names.every((n) => prev.has(n)) ? prev : new Set(names)));
		if (!s || !d || s.running || d.running || more?.length) timer.current = setTimeout(poll, 1000);
	}, []);

	useEffect(() => {
		poll();
		return () => clearTimeout(timer.current);
	}, [poll]);

	const counts = useMemo(() => {
		const c: Record<Filter, number> = { all: items.length, photo: 0, video: 0, gif: 0 };
		for (const i of items) c[i.kind]++;
		return c;
	}, [items]);

	const shown = useMemo(
		() => items.filter((i) => (filter === "all" || i.kind === filter) && !(hideSaved && saved.has(i.name))),
		[items, filter, hideSaved, saved],
	);

	// the handlers read these through refs so they never change and the tiles can stay memoised
	const latest = useRef({ shown, saved });
	latest.current = { shown, saved };
	const lastTick = useRef<number | null>(null);

	const onTick = useCallback((index: number, shift: boolean) => {
		const { shown, saved } = latest.current;
		const name = shown[index].name;
		if (saved.has(name)) return; // already in the folder
		const anchor = shift && lastTick.current !== null ? lastTick.current : index;
		const range = shown.slice(Math.min(anchor, index), Math.max(anchor, index) + 1);
		setTicked((prev) => {
			const next = new Set(prev);
			const on = !prev.has(name);
			for (const i of range) {
				if (saved.has(i.name)) continue;
				if (on) next.add(i.name);
				else next.delete(i.name);
			}
			return next;
		});
		lastTick.current = index;
	}, []);
	const onOpen = useCallback((index: number) => setPreview(index), []);

	function setAllShown(on: boolean) {
		setTicked((prev) => {
			const next = new Set(prev);
			for (const i of shown) {
				if (on && !saved.has(i.name)) next.add(i.name);
				if (!on) next.delete(i.name);
			}
			return next;
		});
		lastTick.current = null;
	}

	const toDownload = useMemo(() => [...ticked].filter((n) => !saved.has(n)), [ticked, saved]);
	const scanning = !!scan?.running;
	const downloading = !!download?.running;

	async function startDownload() {
		setError(null);
		try {
			await api.media.startDownload(toDownload);
			poll();
		} catch (e) {
			setError((e as Error).message);
		}
	}

	async function pick() {
		setError(null);
		try {
			const { path } = await api.media.pickFolder();
			if (path) { onFolderChanged(); poll(); }
		} catch (e) {
			setError((e as Error).message);
		}
	}

	const previewItem = preview === null ? null : shown[preview] ?? null;
	return (
		<div className="flex h-dvh flex-col">
			<header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-5 py-3">
				<Button variant="ghost" size="icon" onClick={onBack} title="Back to Meowl Delete" aria-label="Back to Meowl Delete">
					<ArrowLeftIcon />
				</Button>
				<img src={logo} alt="" className="h-7 w-auto" />
				<h1 className="text-lg font-semibold tracking-tight">@{scan?.username}</h1>
				<span className="flex items-center gap-2 text-sm text-muted-foreground">
					{scanning && <Loader2Icon className="size-4 animate-spin" />}
					{scan && (scanning
						? `${scan.stopping ? "Stopping" : "Finding media"}: ${scan.posts.toLocaleString()}${scan.mediaPosts ? ` / ${scan.mediaPosts.toLocaleString()}` : ""} posts${scan.waiting > 0 ? ` · rate limited, waiting ${scan.waiting}s` : ""}`
						: `${scan.stopped ? "Stopped at" : "Found"} ${items.length.toLocaleString()} files in ${scan.posts.toLocaleString()} posts`)}
				</span>
				<div className="ml-auto flex items-center gap-2">
					{scanning && (
						<Button size="sm" variant="outline" onClick={() => api.media.stopScan().then(poll)} disabled={scan?.stopping}>
							<SquareIcon data-icon="inline-start" /> Stop finding
						</Button>
					)}
					<Button size="sm" variant="outline" onClick={onOpenSetup} disabled={downloading}>
						<UserIcon data-icon="inline-start" /> Change account
					</Button>
				</div>
			</header>

			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-2">
				<div className="flex gap-1">
					{FILTERS.map(({ key, label }) => (
						<Button key={key} size="sm" variant={filter === key ? "secondary" : "ghost"} aria-pressed={filter === key} onClick={() => { setFilter(key); lastTick.current = null; }}>
							{label} <span className="text-muted-foreground tabular-nums">{counts[key].toLocaleString()}</span>
						</Button>
					))}
				</div>
				<Label className="font-normal">
					<Checkbox checked={hideSaved} onCheckedChange={(v) => { setHideSaved(v === true); lastTick.current = null; }} />
					Hide already saved
				</Label>
				<div className="ml-auto flex gap-1">
					<Button size="sm" variant="ghost" onClick={() => setAllShown(true)} disabled={!shown.length}>Tick all shown</Button>
					<Button size="sm" variant="ghost" onClick={() => setAllShown(false)} disabled={!ticked.size}>Untick all shown</Button>
				</div>
			</div>

			{scan?.error && <div className="border-b bg-destructive/10 px-5 py-2 text-sm text-destructive">Finding media stopped early: {scan.error}</div>}

			<main className="min-h-0 flex-1 overflow-y-auto p-5">
				{shown.length ? (
					<div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2.5">
						{shown.map((item, i) => (
							<Tile key={item.name} item={item} index={i} ticked={ticked.has(item.name) && !saved.has(item.name)} saved={saved.has(item.name)} onTick={onTick} onOpen={onOpen} />
						))}
					</div>
				) : (
					<div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
						{scanning ? "Looking for media…"
							: items.length ? "Nothing matches these filters."
							: scan ? "No media found. A protected account only shows media if you follow it."
							: ""}
					</div>
				)}
			</main>

			{download && download.total > 0 && <DownloadProgress progress={download} onStop={() => api.media.stopDownload().then(poll)} />}

			<footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-5 py-3">
				<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={outDir}>
					Saving to {outDir}{outDir.includes("/") ? "/" : "\\"}{scan?.username}
				</span>
				{error && <span className="text-sm text-destructive">{error}</span>}
				<Button variant="outline" onClick={pick} disabled={downloading}>
					<FolderOpenIcon data-icon="inline-start" /> Change folder
				</Button>
				<Button variant="outline" onClick={() => api.media.reveal()}>
					<FolderOpenIcon data-icon="inline-start" /> Open folder
				</Button>
				<Button onClick={startDownload} disabled={downloading || !toDownload.length}>
					<DownloadIcon data-icon="inline-start" /> Download {toDownload.length.toLocaleString()}
				</Button>
			</footer>

			{previewItem && (
				<Lightbox
					item={previewItem}
					position={`${preview! + 1} / ${shown.length}`}
					ticked={ticked.has(previewItem.name)}
					saved={saved.has(previewItem.name)}
					onTick={() => onTick(preview!, false)}
					onClose={() => setPreview(null)}
					onPrev={preview! > 0 ? () => setPreview(preview! - 1) : undefined}
					onNext={preview! < shown.length - 1 ? () => setPreview(preview! + 1) : undefined}
				/>
			)}
		</div>
	);
}
