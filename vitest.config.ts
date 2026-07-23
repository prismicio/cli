import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globalSetup: ["./test/setup.global.ts"],
		forceRerunTriggers: ["**/src/**", "**/tsdown.config.ts"],
		// Must be set at the root: vitest silently ignores `sequence` inside a
		// `projects` entry, which serializes every test in a file.
		sequence: { concurrent: true },
		// Bare `vitest` runs only unit tests; evals require an explicit `--project
		// evals`. Vitest honors `project` in config but only types it as a CLI flag.
		// @ts-expect-error -- untyped config passthrough of the --project flag
		project: "tests",
		projects: [
			{
				test: {
					name: "tests",
					setupFiles: ["./test/setup.ts"],
					include: ["./test/**/*.test.ts"],
					testTimeout: 30_000,
					retry: 2,
					typecheck: { enabled: true },
				},
			},
			{
				test: {
					name: "evals",
					setupFiles: ["./test/setup.ts"],
					include: ["./evals/**/*.eval.ts"],
					maxConcurrency: 8,
					testTimeout: 600_000,
					retry: 0,
				},
			},
		],
	},
});
