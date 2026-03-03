import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	platform: "node",
	minify: true,
	define: {
		"import.meta.env.MODE": JSON.stringify("production"),
		"import.meta.env.DEV": "false",
		"import.meta.env.PROD": "true",
		"import.meta.env.VITE_SENTRY_DSN": "undefined",
		"import.meta.env.VITE_ENABLE_SENTRY": "undefined",
	},
});
