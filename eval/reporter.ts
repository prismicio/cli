import type { Reporter, TestModule } from "vitest/node";

import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RESULTS_PATH = fileURLToPath(new URL("results.jsonl", import.meta.url));
const TRIAL_SUFFIX = / \(trial (\d+)\)$/;

// Appends one row per trial to results.jsonl and prints per-eval pass rates.
// Infra failures (the agent harness died before the eval could be graded) are
// excluded from the rates.
export default class EvalReporter implements Reporter {
	onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
		const tallies = new Map<
			string,
			{ passed: number; failed: number; infra: number; costUsd: number }
		>();

		for (const testModule of testModules) {
			for (const test of testModule.children.allTests()) {
				const state = test.result().state;
				if (state !== "passed" && state !== "failed") continue;

				const name = test.name.replace(TRIAL_SUFFIX, "");
				const trial = Number(test.name.match(TRIAL_SUFFIX)?.[1] ?? "1");
				const agent = test.meta().agent;
				const row = { eval: name, trial, pass: state === "passed", ts: Date.now(), ...agent };
				appendFileSync(RESULTS_PATH, `${JSON.stringify(row)}\n`);

				const tally = tallies.get(name) ?? { passed: 0, failed: 0, infra: 0, costUsd: 0 };
				if (agent?.infra) tally.infra += 1;
				else if (state === "passed") tally.passed += 1;
				else tally.failed += 1;
				tally.costUsd += agent?.costUsd ?? 0;
				tallies.set(name, tally);
			}
		}

		if (tallies.size === 0) return;

		console.info("\nPass rates:");
		for (const [name, { passed, failed, infra, costUsd }] of tallies) {
			const graded = passed + failed;
			const rate = graded > 0 ? Math.round((passed / graded) * 100) : 0;
			const icon = failed === 0 && graded > 0 ? "✓" : "✗";
			const note =
				infra > 0 ? ` (${infra} infra ${infra === 1 ? "failure" : "failures"} excluded)` : "";
			console.info(
				`  ${icon} ${name}: ${passed}/${graded} passed (${rate}%), $${costUsd.toFixed(2)}${note}`,
			);
		}
	}
}
