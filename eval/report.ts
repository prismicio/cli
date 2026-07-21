// Digest of eval/results.jsonl: one block per eval, one line per run (newest
// last), and a footer for the latest run. Within a run, trials aggregate;
// across runs, lines compare — runs measure different CLI versions, so they
// are never averaged together.

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

const rows: Row[] = readFileSync(RESULTS_PATH, "utf8")
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line));

if (rows.length === 0) {
	console.info("No results yet. Run `node --run evals` first.");
	process.exit(0);
}

// Group by eval (in first-seen order), then by run (ascending).
const evals = new Map<string, Map<number, Row[]>>();
for (const row of rows) {
	const runs = evals.get(row.eval) ?? new Map<number, Row[]>();
	const trials = runs.get(row.run) ?? [];
	trials.push(row);
	runs.set(row.run, trials);
	evals.set(row.eval, runs);
}

const RUNS_SHOWN = 10;

for (const [name, runs] of evals) {
	console.info(name);
	for (const run of [...runs.keys()].sort((a, b) => a - b).slice(-RUNS_SHOWN)) {
		console.info(`  ${formatRunLine(run, runs.get(run)!)}`);
	}
	console.info("");
}

const latestRun = Math.max(...rows.map((row) => row.run));
const latest = rows.filter((row) => row.run === latestRun);
const graded = latest.filter((row) => !row.infra);
const passedTrials = graded.filter((row) => row.pass).length;
const latestEvals = new Map<string, Row[]>();
for (const row of graded) {
	latestEvals.set(row.eval, [...(latestEvals.get(row.eval) ?? []), row]);
}
const passedEvals = [...latestEvals.values()].filter((trials) =>
	trials.some((row) => row.pass),
).length;
const maxTrials = Math.max(...[...latestEvals.values()].map((trials) => trials.length));
const cost = latest.reduce((sum, row) => sum + row.costUsd, 0);
const rate = graded.length > 0 ? Math.round((passedTrials / graded.length) * 100) : 0;
console.info(
	`latest run (${formatDate(latestRun)}): ` +
		`${passedEvals}/${latestEvals.size} evals passed best-of-${maxTrials} · ` +
		`${passedTrials}/${graded.length} trials (${rate}%) · $${cost.toFixed(2)}`,
);

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
