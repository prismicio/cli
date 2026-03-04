import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@prismicio/plugin-kit/fs": path.resolve("./packages/plugin-kit/src/fs/index.ts"),
			"@prismicio/plugin-kit": path.resolve("./packages/plugin-kit/src/index.ts"),
			"@prismicio/manager": path.resolve("./packages/manager/src/index.ts"),
			"@prismicio/adapter-next": path.resolve("./packages/adapter-next/src/index.ts"),
			"@prismicio/adapter-nuxt": path.resolve("./packages/adapter-nuxt/src/index.ts"),
			"@prismicio/adapter-sveltekit": path.resolve("./packages/adapter-sveltekit/src/index.ts"),
		},
	},
	test: {
		globalSetup: ["./test/setup.global.ts"],
		setupFiles: ["./test/setup.ts"],
		typecheck: {
			enabled: true,
		},
		coverage: {
			provider: "v8",
			reporter: ["lcovonly", "text"],
			include: ["src"],
		},
	},
});
