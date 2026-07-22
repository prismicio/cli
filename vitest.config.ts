import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globalSetup: ["./test/setup.global.ts"],
		forceRerunTriggers: ["**/dist/index.mjs"],
		typecheck: { enabled: true },
		setupFiles: ["./test/setup.ts"],
		include: ["./test/**/*.test.ts"],
		sequence: { concurrent: true },
		testTimeout: 30_000,
		retry: 2,
	},
});
