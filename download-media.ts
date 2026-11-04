// Command-line download, without the app:
//   X_AUTH_TOKEN=… bun download-media.ts <username or profile link> [--out <folder>] [--no-photos] [--no-videos] [--no-gifs]
import path from "node:path";
import { downloadMedia, parseUsername } from "./src/bun/media";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const outIndex = args.indexOf("--out");
const outDir = outIndex >= 0 ? args[outIndex + 1] : path.resolve("downloads");
const username = parseUsername(args.find((a, i) => !a.startsWith("--") && (outIndex < 0 || i !== outIndex + 1)) ?? "");
const token = process.env.X_AUTH_TOKEN?.trim();

if (!username || !outDir) {
	console.error("usage: X_AUTH_TOKEN=… bun download-media.ts <username or profile link> [--out <folder>] [--no-photos] [--no-videos] [--no-gifs]");
	process.exit(1);
}
if (!token) {
	console.error("Set X_AUTH_TOKEN to your auth_token cookie.");
	process.exit(1);
}

let stop = false;
process.on("SIGINT", () => { stop = true; });

try {
	const r = await downloadMedia({
		username,
		token,
		outDir,
		types: { photos: !flag("--no-photos"), videos: !flag("--no-videos"), gifs: !flag("--no-gifs") },
		shouldStop: () => stop,
		onEvent: (e) => {
			if (e.type === "start") console.log(`Saving @${e.username} to ${path.join(outDir, e.username)} (Ctrl+C to stop)`);
			if (e.type === "page") console.log(`${e.posts} posts scanned, ${e.found} files found`);
			if (e.type === "file") console.log(`saved ${e.name}`);
			if (e.type === "fail") console.error(`FAILED ${e.name}: ${e.msg}`);
			if (e.type === "wait") console.log(`rate limited — waiting ${e.seconds}s`);
		},
	});
	console.log(`${r.stopped ? "Stopped" : "Done"}. Saved ${r.downloaded}, already had ${r.skipped}, failed ${r.failed}.`);
	process.exit(r.failed ? 2 : 0); // the TLS helper keeps the process alive otherwise
} catch (err) {
	console.error(String((err as Error).message || err));
	process.exit(1);
}
