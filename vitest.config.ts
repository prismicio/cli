import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globalSetup: ["./test/setup.global.ts"],
		forceRerunTriggers: ["**/src/**", "**/tsdown.config.ts"],
		sequence: { concurrent: true },
		setupFiles: ["./test/setup.ts"],
		include: ["./test/**/*.test.ts"],
		testTimeout: 30_000,
		retry: 2,
		typecheck: { enabled: true },
	},
});
