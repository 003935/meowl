// CycleTLS (emusks' TLS client) starts a Go helper binary that lives next to its
// own module: path.join(__dirname, "index.exe"). Bun's bundler bakes __dirname
// in as the *build machine's* node_modules path, which doesn't exist once the
// app is installed elsewhere. electrobun.config.ts copies the helper into the
// app's resources; this redirects CycleTLS to that copy when the baked-in path
// is missing (dev builds keep using node_modules). It also turns off the shell
// CycleTLS launches the helper through on macOS/Linux, so paths with spaces work.
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RESOURCES_FOLDER } from "electrobun/bun/paths";

const BAKED = /[\\/]cycletls[\\/]dist[\\/](index[\w-]*(?:\.exe)?)$/;

export function useBundledCycleTLS() {
	const redirect = (p: unknown) => {
		if (typeof p !== "string") return null;
		const m = p.match(BAKED);
		if (!m || fs.statSync(p, { throwIfNoEntry: false })) return null;
		const bundled = path.join(RESOURCES_FOLDER, "app", "cycletls", m[1]);
		return fs.statSync(bundled, { throwIfNoEntry: false }) ? bundled : null;
	};

	const existsSync = fs.existsSync;
	fs.existsSync = ((p: fs.PathLike) => existsSync(redirect(p) ?? p)) as typeof fs.existsSync;

	const spawn = childProcess.spawn;
	childProcess.spawn = function (this: unknown, command: string, ...rest: unknown[]) {
		if (typeof command === "string" && BAKED.test(command)) {
			const opts = rest.find((r) => r && typeof r === "object" && !Array.isArray(r)) as childProcess.SpawnOptions | undefined;
			const bundled = redirect(command);
			if (bundled) command = bundled;
			if (opts) {
				opts.cwd = path.dirname(command);
				// CycleTLS uses shell: true off Windows without quoting the path, which
				// breaks on any path with a space (e.g. "Tweet Deleter.app").
				opts.shell = false;
			}
		}
		return (spawn as (...a: unknown[]) => childProcess.ChildProcess).call(this, command, ...rest);
	} as typeof childProcess.spawn;
}
