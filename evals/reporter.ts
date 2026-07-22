import type { Reporter, TestModule } from "vitest/node";

import { execSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as z from "zod/mini";

// What the eval fixture records about one agent trial.
export const AgentRecord = z.object({
	// Total tokens including cache reads (context processed, not billed volume).
	tokens: z.number(),
	// Billed agent cost for the trial; judge calls not included.
	costUsd: z.number(),
	turns: z.number(),
	// Agent wall time, excluding fixture setup and judging.
	durationMs: z.number(),
	model: z.string(),
	// Bash commands invoking the prismic CLI, verbatim.
	prismicCalls: z.array(z.string()),
	// True when the harness died before grading; excluded from pass rates.
	infra: z.optional(z.boolean()),
});
export type AgentRecord = z.infer<typeof AgentRecord>;

// One results.jsonl row per trial.
export const Row = z.extend(AgentRecord, {
	// Eval name; trials of the same eval share it.
	eval: z.string(),
	// Whether the trial's assertions passed.
	pass: z.boolean(),
	// Run id: epoch ms shared by every trial in one vitest invocation.
	run: z.number(),
	// Short git commit of the CLI under measurement.
	cli: z.optional(z.string()),
});
export type Row = z.infer<typeof Row>;

const RESULTS_PATH = fileURLToPath(new URL("results.jsonl", import.meta.url));
const RUNS_KEPT = 100;

// Appends one row per trial to results.jsonl and prints per-eval pass rates.
// Infra failures (the agent harness died before the eval could be graded) are
// excluded from the rates.
export default class EvalReporter implements Reporter {
	onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
		const run = Date.now();
		let cli: string | undefined;
		try {
			cli = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
		} catch {}
		const tallies = new Map<
			string,
			{ passed: number; failed: number; infra: number; costUsd: number }
		>();

		for (const testModule of testModules) {
			for (const test of testModule.children.allTests()) {
				const state = test.result().state;
				if (state !== "passed" && state !== "failed") continue;

				const name = test.name;
				const agent = test.meta().agent;
				if (!agent) continue;
				const row: Row = { eval: name, pass: state === "passed", run, cli, ...agent };
				appendFileSync(RESULTS_PATH, `${JSON.stringify(row)}\n`);

				const tally = tallies.get(name) ?? { passed: 0, failed: 0, infra: 0, costUsd: 0 };
				if (agent.infra) tally.infra += 1;
				else if (state === "passed") tally.passed += 1;
				else tally.failed += 1;
				tally.costUsd += agent.costUsd;
				tallies.set(name, tally);
			}
		}

		if (tallies.size === 0) return;
		pruneRuns();

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

function pruneRuns(): void {
	const rows = readFileSync(RESULTS_PATH, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as { run: number });
	const kept = new Set(
		[...new Set(rows.map((row) => row.run))].sort((a, b) => b - a).slice(0, RUNS_KEPT),
	);
	if (kept.size === new Set(rows.map((row) => row.run)).size) return;
	const lines = rows.filter((row) => kept.has(row.run)).map((row) => JSON.stringify(row));
	writeFileSync(RESULTS_PATH, `${lines.join("\n")}\n`);
}
