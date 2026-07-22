import { defineConfig } from "vitest/config";

const runEvals = process.env.RUN_EVALS === "true";

// Safety gate. Evals run a real agent with --dangerously-skip-permissions, which
// can run arbitrary commands on the host, so only allow them in an isolated,
// disposable environment: a container the developer opts into, or a GitHub Actions
// runner. Thrown at config load, before any setup creates a repo or spends.
if (
	runEvals &&
	process.env.PRISMIC_ALLOW_EVALS !== "true" &&
	process.env.GITHUB_ACTIONS !== "true"
) {
	throw new Error(
		"Refusing to run evals outside an isolated environment. They run an agent with " +
			"--dangerously-skip-permissions against a real account. Set PRISMIC_ALLOW_EVALS=true " +
			"only inside a container or disposable VM.",
	);
}

export default defineConfig({
	test: {
		globalSetup: ["./test/setup.global.ts"],
		forceRerunTriggers: ["**/dist/index.mjs"],
		typecheck: { enabled: true },
		reporters: runEvals ? ["default", "./evals/reporter.ts"] : ["default"],
		projects: [
			{
				test: {
					name: "tests",
					setupFiles: ["./test/setup.ts"],
					include: ["./test/**/*.test.ts"],
					sequence: { concurrent: true },
					testTimeout: 30_000,
					retry: 2,
				},
			},
			// Evals run a real agent against the real backend. Gated behind
			// RUN_EVALS so they stay out of `unit` and CI.
			...(runEvals
				? [
						{
							test: {
								name: "evals",
								setupFiles: ["./test/setup.ts"],
								include: ["./evals/**/*.eval.ts"],
								sequence: { concurrent: true },
								maxConcurrency: 8,
								testTimeout: 600_000,
								retry: 0,
							},
						},
					]
				: []),
		],
	},
});
