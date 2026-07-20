import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// One record per eval per run, committed in the repo, read back to trend
// effectiveness and efficiency over time. Evals run serially (see the evals
// project in vitest.config.ts), so a single module-level accumulator is safe.
const RESULTS_PATH = fileURLToPath(new URL("results.jsonl", import.meta.url));

type Row = { eval: string; score?: number };

type Pending = {
	tokens: number;
	turns: number;
	costUsd: number;
	durationMs: number;
	model: string;
	// Every `prismic` command the agent ran, verbatim. The discovery signal: which
	// subcommands it reached for (`--help`, `docs`, `field add text ...`), and the
	// per-field type it chose is encoded in the `field add` calls themselves.
	prismicCalls: string[];
	score?: number;
	threshold?: number;
};

let pending: Pending | undefined;

// Called by the agent fixture after each run, accumulating so a multi-step eval
// records the whole task's cost, not just its last agent call. The judge's own
// cost is deliberately excluded — it is eval overhead, not the agent's work.
export function recordAgent(
	metrics: { tokens: number; turns: number; costUsd: number; durationMs: number },
	model: string,
	prismicCalls: string[],
): void {
	pending ??= { tokens: 0, turns: 0, costUsd: 0, durationMs: 0, model, prismicCalls: [] };
	pending.tokens += metrics.tokens;
	pending.turns += metrics.turns;
	pending.costUsd += metrics.costUsd;
	pending.durationMs += metrics.durationMs;
	pending.prismicCalls.push(...prismicCalls);
}

// The best score this eval has scored in any prior run, or 0 if it has none.
// Backs the ratchet gate: the bar only moves up, so the target never regresses.
export function priorBest(name: string): number {
	let raw: string;
	try {
		raw = readFileSync(RESULTS_PATH, "utf8");
	} catch {
		return 0;
	}
	let best = 0;
	for (const line of raw.split("\n")) {
		if (line.trim().length === 0) continue;
		const row = JSON.parse(line) as Row;
		if (row.eval === name && typeof row.score === "number" && row.score > best) best = row.score;
	}
	return best;
}

// Called by the judge matcher.
export function recordScore(score: number, threshold: number): void {
	if (pending) {
		pending.score = score;
		pending.threshold = threshold;
	}
}

// Called from afterEach. Writes one row and resets. No-ops for a test that never
// ran the agent (nothing to record).
export function flushRun(name: string, pass: boolean, ts: number): void {
	if (!pending) return;
	appendFileSync(RESULTS_PATH, `${JSON.stringify({ eval: name, pass, ts, ...pending })}\n`);
	pending = undefined;
}
