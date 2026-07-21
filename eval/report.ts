// Digest of eval/results.jsonl scoped to the last EVAL_HISTORY runs (default
// 10): one block per eval with one line per run it appeared in (newest last),
// and a footer line per run. Within a run, trials aggregate; across runs,
// lines compare — runs measure different CLI versions, so they are never
// averaged together.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Row = {
	eval: string;
	pass: boolean;
	run: number;
	cli?: string;
	tokens: number;
	costUsd: number;
	turns: number;
	durationMs: number;
	model: string;
	prismicCalls: string[];
	infra?: boolean;
};

const RESULTS_PATH = fileURLToPath(new URL("results.jsonl", import.meta.url));

const allRows: Row[] = readFileSync(RESULTS_PATH, "utf8")
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line));

if (allRows.length === 0) {
	console.info("No results yet. Run `node --run evals` first.");
	process.exit(0);
}

const RUNS_SHOWN = Number(process.env.EVAL_HISTORY) || 10;

const shownRuns = [...new Set(allRows.map((row) => row.run))]
	.sort((a, b) => a - b)
	.slice(-RUNS_SHOWN);
const rows = allRows.filter((row) => shownRuns.includes(row.run));

// Group by eval (in first-seen order), then by run (ascending).
const evals = new Map<string, Map<number, Row[]>>();
for (const row of rows) {
	const runs = evals.get(row.eval) ?? new Map<number, Row[]>();
	const trials = runs.get(row.run) ?? [];
	trials.push(row);
	runs.set(row.run, trials);
	evals.set(row.eval, runs);
}

for (const [name, runs] of evals) {
	console.info(name);
	for (const run of [...runs.keys()].sort((a, b) => a - b)) {
		console.info(`  ${formatRunLine(run, runs.get(run)!)}`);
	}
	console.info("");
}

for (const run of shownRuns) {
	const trials = rows.filter((row) => row.run === run);
	const graded = trials.filter((row) => !row.infra);
	const passed = graded.filter((row) => row.pass).length;
	const rate = graded.length > 0 ? Math.round((passed / graded.length) * 100) : 0;
	const cost = trials.reduce((sum, row) => sum + row.costUsd, 0);
	const evalCount = new Set(trials.map((row) => row.eval)).size;
	const cli = trials.find((row) => row.cli)?.cli;
	console.info(
		`run ${formatDate(run)}${cli ? ` @ ${cli}` : ""}: ` +
			`${passed}/${graded.length} trials passed (${rate}%) across ${evalCount} eval${evalCount === 1 ? "" : "s"} · $${cost.toFixed(2)}`,
	);
}

function formatRunLine(run: number, trials: Row[]): string {
	const graded = trials.filter((row) => !row.infra);
	const infra = trials.length - graded.length;
	const passed = graded.filter((row) => row.pass).length;
	const pct = graded.length > 0 ? Math.round((passed / graded.length) * 100) : 0;
	const rate = `${passed}/${graded.length} ${`(${pct}%)`.padStart(6)}`;
	const cost = trials.reduce((sum, row) => sum + row.costUsd, 0);
	const tokens = mean(trials.map((row) => row.tokens));
	const turns = mean(trials.map((row) => row.turns));
	const duration = mean(trials.map((row) => row.durationMs));
	const note = infra > 0 ? `   (${infra} infra excluded)` : "";
	const cli = trials.find((row) => row.cli)?.cli;
	return (
		`${formatDate(run)}${cli ? ` @ ${cli}` : ""}   ${rate}   $${cost.toFixed(2)}   ` +
		`${Math.round(tokens / 1000)}k tok   ${turns.toFixed(1)} turns   ` +
		`${Math.round(duration / 1000)}s${note}`
	);
}

function mean(values: number[]): number {
	return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function formatDate(ts: number): string {
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	const date = new Date(ts);
	const pad = (n: number): string => String(n).padStart(2, "0");
	return `${months[date.getMonth()]} ${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
