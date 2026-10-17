import { toast } from "sonner";

// UI scaling with Ctrl/Cmd + = / - / 0 (and Ctrl + mouse wheel), like a browser.
// It scales the root font size: the whole UI is sized in rem, and unlike CSS
// `zoom` this keeps popovers and menus positioned correctly.
const LEVELS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const KEY = "uiScale";

let scale = 1;

function apply(next: number, announce: boolean) {
	scale = next;
	document.documentElement.style.fontSize = `${16 * scale}px`;
	try { localStorage.setItem(KEY, String(scale)); } catch {}
	if (announce) toast(`Zoom ${Math.round(scale * 100)}%`, { id: "zoom", duration: 1200 });
}

function step(dir: 1 | -1) {
	const next = dir > 0 ? LEVELS.find((l) => l > scale) : LEVELS.findLast((l) => l < scale);
	if (next !== undefined) apply(next, true);
}

export function installZoom() {
	try {
		const saved = Number(localStorage.getItem(KEY));
		if (LEVELS.includes(saved)) apply(saved, false);
	} catch {}

	window.addEventListener("keydown", (e) => {
		if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
		if (e.key === "=" || e.key === "+") step(1);
		else if (e.key === "-" || e.key === "_") step(-1);
		else if (e.key === "0") apply(1, true);
		else return;
		e.preventDefault(); // don't also let the webview zoom
	});

	window.addEventListener(
		"wheel",
		(e) => {
			if (!e.ctrlKey) return;
			e.preventDefault();
			step(e.deltaY < 0 ? 1 : -1);
		},
		{ passive: false },
	);
}
