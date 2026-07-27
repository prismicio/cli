import type { Reporter, TestModule } from "vitest/node";

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Per-trial stats recorded by the agent fixture; the reporter adds `pass`. */
export type Trial = {
	model: string;
	/** Billed agent cost for the trial; judge calls not included. */
	costUsd: number;
	/** Agent wall time in seconds, excluding fixture setup and judging. */
	durationS: number;
	/** prismic CLI invocations, verbatim minus the leading `npx prismic`. */
	calls: string[];
};

const RESULTS_PATH = fileURLToPath(new URL("results.json", import.meta.url));

// Writes results.json with the run's trials grouped by eval, sorted by name.
// The file holds only the latest run; history lives in git.
export default class EvalReporter implements Reporter {
	onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
		let model = "";
		const evals: Record<string, object[]> = {};

		for (const testModule of testModules) {
			for (const test of testModule.children.allTests()) {
				const state = test.result().state;
				if (state !== "passed" && state !== "failed") continue;
				const trial = test.meta().agent;
				if (!trial) continue;
				model = trial.model;
				(evals[test.name] ??= []).push({
					pass: state === "passed",
					costUsd: Math.round(trial.costUsd * 100) / 100,
					durationS: trial.durationS,
					calls: trial.calls,
				});
			}
		}

		if (Object.keys(evals).length === 0) return;
		const sorted = Object.fromEntries(Object.entries(evals).sort(([a], [b]) => a.localeCompare(b)));
		writeFileSync(RESULTS_PATH, JSON.stringify({ model, evals: sorted }, null, "\t") + "\n");
	}
}
