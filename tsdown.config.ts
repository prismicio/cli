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
	alias: {
		"@prismicio/plugin-kit/fs": "./packages/plugin-kit/src/fs/index.ts",
		"@prismicio/plugin-kit": "./packages/plugin-kit/src/index.ts",
		"@prismicio/manager": "./packages/manager/src/index.ts",
		"@prismicio/adapter-next": "./packages/adapter-next/src/index.ts",
		"@prismicio/adapter-nuxt": "./packages/adapter-nuxt/src/index.ts",
		"@prismicio/adapter-sveltekit": "./packages/adapter-sveltekit/src/index.ts",
	},
});
