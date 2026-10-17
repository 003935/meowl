import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// The Bun main process serves the API and archive media on this port; during
// `bun run dev:hmr` Vite proxies to it so the UI behaves the same as in the app.
const API = "http://127.0.0.1:8731";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: { "@": resolve(import.meta.dirname, "src/mainview") },
	},
	root: "src/mainview",
	base: "./",
	build: {
		outDir: "../../dist",
		emptyOutDir: true,
	},
	server: {
		port: 5173,
		strictPort: true,
		proxy: { "/api": API, "/media": API },
	},
});
