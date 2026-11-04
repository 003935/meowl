import { useEffect } from "react";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import type { MediaItem } from "../../shared/types";
import { Button } from "@/components/ui/button";

type Props = {
	item: MediaItem;
	position: string;
	ticked: boolean;
	saved: boolean;
	onTick: () => void;
	onClose: () => void;
	onPrev?: () => void;
	onNext?: () => void;
};

// Full-size preview. Arrow keys move, Space ticks, Esc closes.
export function Lightbox({ item, position, ticked, saved, onTick, onClose, onPrev, onNext }: Props) {
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
			else if (e.key === "ArrowLeft") onPrev?.();
			else if (e.key === "ArrowRight") onNext?.();
			else if (e.key === " " && !(e.target instanceof HTMLVideoElement)) onTick();
			else return;
			e.preventDefault();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose, onPrev, onNext, onTick]);

	const created = new Date(item.createdAt);
	return (
		<div role="dialog" aria-modal="true" aria-label={`Preview of ${item.name}`} className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white">
			<div className="flex items-center gap-3 px-4 py-2 text-sm">
				<span className="tabular-nums text-white/70">{position}</span>
				{!Number.isNaN(created.getTime()) && <span className="text-white/70">{created.toLocaleDateString()}</span>}
				<a className="flex items-center gap-1 text-sky-400 hover:underline" href={item.tweetUrl}>
					Open on X <ExternalLinkIcon className="size-3.5" />
				</a>
				<div className="ml-auto flex items-center gap-2">
					{saved ? (
						<span className="flex items-center gap-1 text-emerald-400"><CheckIcon className="size-4" /> Saved</span>
					) : (
						<Button size="sm" variant={ticked ? "default" : "secondary"} onClick={onTick}>
							{ticked && <CheckIcon data-icon="inline-start" />} {ticked ? "Ticked" : "Tick"}
						</Button>
					)}
					<Button size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}><XIcon /></Button>
				</div>
			</div>
			<div className="relative flex min-h-0 flex-1 items-center justify-center px-14" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
				{item.kind === "photo" ? (
					<img key={item.name} src={item.url} alt={item.text} className="max-h-full max-w-full object-contain" />
				) : (
					<video
						key={item.name}
						src={item.url}
						poster={item.thumb || undefined}
						controls
						autoPlay={item.kind === "gif"}
						loop={item.kind === "gif"}
						muted={item.kind === "gif"}
						className="max-h-full max-w-full"
					/>
				)}
				{onPrev && (
					<Button size="icon" variant="secondary" aria-label="Previous" className="absolute left-3" onClick={onPrev}><ChevronLeftIcon /></Button>
				)}
				{onNext && (
					<Button size="icon" variant="secondary" aria-label="Next" className="absolute right-3" onClick={onNext}><ChevronRightIcon /></Button>
				)}
			</div>
			{item.text && <p className="max-h-24 overflow-y-auto px-14 py-3 text-center text-sm whitespace-pre-wrap text-white/80">{item.text}</p>}
		</div>
	);
}
