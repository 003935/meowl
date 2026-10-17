import type { ElectrobunConfig } from "electrobun";

// Same table as cycletls/dist/index.js.
const CYCLETLS_BIN =
	process.platform === "win32" ? "index.exe"
	: process.platform === "darwin" ? (process.arch === "arm64" ? "index-mac-arm64" : "index-mac")
	: process.arch === "arm64" ? "index-arm64"
	: process.arch === "arm" ? "index-arm"
	: "index";

export default {
	app: {
		name: "Tweet Deleter",
		identifier: "dev.tweetdeleter.app",
		version: "2.0.0",
		description: "Browse your X archive and bulk-delete old tweets, replies and retweets",
	},
	build: {
		// Run the main process on Bun (emusks + CycleTLS need Node APIs that Bun provides).
		mainProcess: "bun",
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		// Vite builds the shadcn/React UI to dist/; the Bun server serves it from views/mainview.
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
			// CycleTLS (used by emusks) spawns a Go helper that sits next to its own
			// module; the bundler can't follow that, so ship this platform's helper.
			[`node_modules/cycletls/dist/${CYCLETLS_BIN}`]: `cycletls/${CYCLETLS_BIN}`,
		},
		watchIgnore: ["dist/**"],
		mac: { bundleCEF: false },
		linux: { bundleCEF: false },
		win: { bundleCEF: false },
	},
} satisfies ElectrobunConfig;
