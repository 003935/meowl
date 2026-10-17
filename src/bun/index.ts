// Electrobun main process (runs on Bun): starts the local server and opens the window.
import path from "node:path";
import { BrowserWindow, Updater, Utils } from "electrobun/bun";
import { VIEWS_FOLDER } from "electrobun/bun/paths";
import { startServer } from "./server";
import { openStore } from "./store";
import { useBundledCycleTLS } from "./cycletls";

const VITE_DEV_URL = "http://localhost:5173";

useBundledCycleTLS();

const store = openStore(Utils.paths.userData);

const server = startServer({
	store,
	viewsDir: path.join(VIEWS_FOLDER, "mainview"),
	pickFolder: async () => {
		const [picked] = await Utils.openFileDialog({
			startingFolder: store.settings().archivePath || Utils.paths.downloads,
			canChooseFiles: false,
			canChooseDirectory: true,
			allowsMultipleSelection: false,
		});
		return picked || null;
	},
	openExternal: (url) => Utils.openExternal(url),
});
console.log(`Data folder: ${store.dir}`);
console.log(`Serving on http://127.0.0.1:${server.port}/`);

// In dev, use the Vite dev server for hot reload when it's running (`bun run dev:hmr`).
async function mainViewUrl() {
	if ((await Updater.localInfo.channel()) === "dev") {
		try {
			await fetch(VITE_DEV_URL, { method: "HEAD" });
			console.log(`HMR enabled: using Vite dev server at ${VITE_DEV_URL}`);
			return VITE_DEV_URL;
		} catch {}
	}
	return `http://127.0.0.1:${server.port}/`;
}

new BrowserWindow({
	title: "Tweet Deleter",
	url: await mainViewUrl(),
	frame: { width: 1400, height: 900, x: 120, y: 80 },
});
