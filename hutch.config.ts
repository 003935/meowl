// @hutch cli=0.27.1 cottontail=0.7.1
// Same tasks as the package.json scripts, for running through Hutch directly
// (`hutch run dev`). With Bun, `bun run dev` does the same thing.
export default {
	scripts: {
		install: ["hutch", "install", "--frozen-lockfile"],
		start: "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev",
		dev: "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev --watch",
		build: "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun build --env=stable",
	},
	electrobun: {
		version: "2.0.2",
	},
};
