import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globalSetup: ["./test/setup.global.ts"],
		forceRerunTriggers: ["**/dist/index.mjs"],
		typecheck: {
			enabled: true,
		},
		sequence: {
			concurrent: true,
		},
	},
});
