// Where the app keeps its files. The desktop app uses its per-user data folder;
// the command-line scripts pass the same folder in (see delete-selected.ts).
//
//   settings.json  archive path
//   tweets.json    parsed archive ({ tweets, replies, retweets })
//   selected.json  ticked ids
//   deleted.json   ids already deleted (resume log)
import fs from "node:fs";
import path from "node:path";
import type { Settings } from "../shared/types";

export type Store = ReturnType<typeof openStore>;

export function openStore(dir: string) {
	fs.mkdirSync(dir, { recursive: true });
	const file = (name: string) => path.join(dir, name);
	const readJson = <T>(name: string, fallback: T): T => {
		try {
			return JSON.parse(fs.readFileSync(file(name), "utf8"));
		} catch {
			return fallback;
		}
	};
	const writeJson = (name: string, value: unknown) => fs.writeFileSync(file(name), JSON.stringify(value));

	return {
		dir,
		TWEETS: file("tweets.json"),
		readIds: (name: "selected.json" | "deleted.json") => readJson<string[]>(name, []),
		writeIds: (name: "selected.json" | "deleted.json", ids: string[]) => writeJson(name, ids),
		settings: (): Settings => readJson<Settings>("settings.json", {}),
		saveSettings: (s: Settings) => writeJson("settings.json", s),
	};
}
