import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globalSetup: ["./test/setup.global.ts"],
		forceRerunTriggers: ["**/dist/index.mjs"],
		typecheck: { enabled: true },
		retry: 1,
		projects: [
			{
				test: {
					name: "concurrent",
					setupFiles: ["./test/setup.ts"],
					include: ["./test/**/*.test.ts"],
					exclude: ["./test/*.serial.test.ts"],
					sequence: { concurrent: true },
					testTimeout: 10_000,
				},
			},
			{
				test: {
					name: "serial",
					setupFiles: ["./test/setup.ts"],
					include: ["./test/*.serial.test.ts"],
					sequence: { concurrent: false },
					fileParallelism: false,
					testTimeout: 10_000,
				},
			},
		],
	},
});
