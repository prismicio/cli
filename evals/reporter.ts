import type { Reporter, TestModule } from "vitest/node";

import { readdirSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
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

const EVALS_DIR = fileURLToPath(new URL(".", import.meta.url));
const RESULTS_PATH = fileURLToPath(new URL("results.json", import.meta.url));
const LOCAL_RESULTS_PATH = fileURLToPath(new URL("results.local.json", import.meta.url));

// Writes the run's trials grouped by eval, sorted by name, to
// results.local.json (gitignored) — and, when every eval ran, to results.json.
// Filtered runs (file filters, -t, it.only) never touch results.json, so it
// always holds one full run; history lives in git.
export default class EvalReporter implements Reporter {
	onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
		let model = "";
		let filtered = false;
		const evals: Record<string, object[]> = {};

		for (const testModule of testModules) {
			for (const test of testModule.children.allTests()) {
				const result = test.result();
				// Vitest reports -t-filtered, .only-suppressed, and it.skip tests
				// identically (skipped, mode "skip"); only it.todo stays apart. So
				// permanent disables must be authored as it.todo, and any other
				// skipped test means the run was filtered.
				if (result.state === "skipped" && test.options.mode !== "todo") filtered = true;
				if (result.state !== "passed" && result.state !== "failed") continue;
				const threw = result.state === "failed" && result.errors.length > 0;
				const trial = test.meta().agent;
				// A missing trial means fixture setup failed before the agent got a
				// prompt: nothing was measured, so the run is not a full snapshot.
				if (!trial || threw) {
					filtered = true;
					continue;
				}
				model = trial.model;
				(evals[`${testModule.relativeModuleId} / ${test.name}`] ??= []).push({
					pass: result.state === "passed",
					costUsd: Math.round(trial.costUsd * 100) / 100,
					durationS: trial.durationS,
					calls: trial.calls,
				});
			}
		}

		if (Object.keys(evals).length === 0) return;
		const sorted = Object.fromEntries(Object.entries(evals).sort(([a], [b]) => a.localeCompare(b)));
		// Single-line output keeps run-over-run diffs to one changed line; read
		// it with jq or `node --run evals:report`.
		const report = JSON.stringify({ model, evals: sorted }) + "\n";
		writeFileSync(LOCAL_RESULTS_PATH, report);

		const evalFiles = readdirSync(EVALS_DIR).filter((file) => file.endsWith(".eval.ts"));
		const ranFiles = new Set(testModules.map((testModule) => basename(testModule.moduleId)));
		if (filtered || !evalFiles.every((file) => ranFiles.has(file))) {
			console.info("Partial run: wrote results.local.json, leaving results.json untouched.");
			return;
		}
		writeFileSync(RESULTS_PATH, report);
	}
}
