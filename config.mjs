// Where your unzipped Twitter archive lives (the folder containing data/tweets.js).
// Set it either way:
//   TWITTER_ARCHIVE=/path/to/archive node server.mjs
//   or create local.config.json:  { "archivePath": "/path/to/archive" }   (gitignored)
//
// This app itself must live in a folder with NO spaces in its path: CycleTLS
// (used by emusks) spawns its helper binary through the shell without quoting
// the path, so it fails to start from any folder with a space in its name.
// The archive folder may contain spaces.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fromLocalConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "local.config.json"), "utf8")).archivePath;
  } catch {
    return undefined;
  }
}

export const ARCHIVE = process.env.TWITTER_ARCHIVE || fromLocalConfig();

if (!ARCHIVE) {
  console.error('No archive configured. Set TWITTER_ARCHIVE or create local.config.json: { "archivePath": "/path/to/archive" }');
  process.exit(1);
}
