# tweet-viewer

Browse your Twitter/X data archive in three side-by-side columns (tweets, replies, retweets), tick what you want gone, and bulk-delete it from X with live progress.

Deletion goes through [emusks](https://emusks.tiago.zip), a reverse-engineered X client, using your own `auth_token` cookie.

> ⚠️ Using unofficial X APIs breaks X's Terms of Service and could get the account limited. Deletion is permanent. Test on a throwaway account first (`test-delete.mjs`).

## Setup

Requires Node 20+.

```bash
npm install
```

Point it at your unzipped archive (the folder that contains `data/tweets.js`):

```bash
echo '{ "archivePath": "/path/to/twitter-archive" }' > local.config.json
```

> **Keep this repo in a folder with no spaces in its path.** CycleTLS (used by emusks) launches its helper binary without quoting the path, and it silently fails to start from a folder like `My Projects/`. The archive folder itself may contain spaces.

## Use

```bash
npm run build     # parse the archive → tweets.json (tweets before 2024-01-01; CUTOFF=YYYY-MM-DD to change)
npm start         # http://127.0.0.1:8731/viewer/
```

- Click a tweet (or shift-click a range) to tick it. Ticks autosave to `selected.json`.
- Filter by text or date range; **Tick all shown** ticks only what matches.
- Paste your `auth_token` (x.com → DevTools → Application → Cookies → `auth_token`), click **Delete N ticked**.
- Runs are resumable: each success is recorded in `deleted.json` immediately.

X allows roughly 200 deletes per 15 minutes per account; the deleter waits out rate limits automatically. A new token for the same account doesn't help.

### Command line

```bash
node delete-selected.mjs                                   # dry run of what's ticked
X_AUTH_TOKEN=… node delete-selected.mjs --confirm          # delete what's ticked
X_AUTH_TOKEN=… node test-delete.mjs [--confirm] <tweet links…>   # test on any account
```

## Files

| File | Purpose |
|---|---|
| `build.mjs` | Parses the archive into `tweets.json` |
| `server.mjs` | Local server: serves the viewer and media, saves ticks, runs deletions |
| `deleter.mjs` | Shared deletion logic (emusks, retries, rate-limit backoff, resumable state) |
| `index.html` | The viewer UI |
| `delete-selected.mjs` / `test-delete.mjs` | Command-line deletion |
| `config.mjs` | Archive path lookup |

## Roadmap: native Rust/GPUI app

Proposed (not started): a native desktop app in Rust + [GPUI](https://www.gpui.rs) with the same features. emusks is JavaScript, so the plan is for the Rust app to spawn a small Node helper (reusing `deleter.mjs`) and exchange JSON-lines messages over stdin/stdout (`delete`, `stop` → progress events). On macOS, GPUI's `runtime_shaders` feature avoids needing full Xcode. The helper must live in a space-free path (see above).

## License

AGPL-3.0-only (required by emusks, which is AGPL-3.0; CycleTLS is GPL-3.0).
