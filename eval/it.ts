import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import dedent from "dedent";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, expect } from "vitest";
import * as z from "zod/mini";

import { it as base } from "../test/it";

// Load secrets (ANTHROPIC_API_KEY) for local runs. In CI these come from the
// environment (a GitHub secret), so a missing file is fine.
try {
	process.loadEnvFile(fileURLToPath(new URL("../.env.test.local", import.meta.url)));
} catch {}

const BIN = fileURLToPath(new URL("../dist/index.mjs", import.meta.url));
const RESULTS_PATH = fileURLToPath(new URL("results.jsonl", import.meta.url));
const MODEL = process.env.EVAL_MODEL ?? "claude-sonnet-5";
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "claude-haiku-4-5-20251001";
// A run passes when it lands within one bucket of judge noise below the bar, so an
// occasional low grade doesn't fail work that really met the bar.
const TOLERANCE = 0.15;

// Tells the agent the CLI exists and to drive it, mirroring the `prismicio/skills`
// prismic skill but hard-coded and appended to the system prompt, so the eval does
// not depend on the developer's installed skill. It points at the CLI; it does not
// encode modeling answers.
const PRISMIC_GUIDANCE = dedent`
	The \`prismic\` CLI manages Prismic content models, repository settings, and docs.
	1. Always run commands via \`npx prismic\`. Do not guess command syntax.
	2. Start with \`npx prismic --help\`; inspect details with \`npx prismic <command> --help\`.
	3. Use \`npx prismic docs list\` and \`npx prismic docs view <path>\` for documentation.
	4. Prefer CLI workflows. Never directly edit model JSON files — always use the CLI.
	5. If the CLI cannot do something, say so instead of working around it.
`;

export type AgentResult = {
	// Every shell command the agent ran, in order: `prismic ...`, `npx
	// create-next-app`, `git`, etc. The discovery signal, and what `toHaveRun` checks.
	commands: string[];
};

declare module "vitest" {
	// oxlint-disable-next-line no-explicit-any
	interface Matchers<T = any> {
		// Assert the agent ran `bin` with `positionals` (a leading prefix). Matches
		// any command the agent ran, e.g. `npx prismic field add ...`.
		toHaveRun(bin: string, positionals?: string[]): T;
		// Grade `content` against a natural-language rubric with an LLM judge. Passes
		// when the 0-1 score clears `best` (the highest score reached before, kept as a
		// literal in the test). Under `vitest -u` a better score rewrites that literal;
		// otherwise a better score is reported as a bar that can be raised.
		toSatisfyJudge(rubric: string, best?: number): Promise<T>;
	}
}

// The existing test fixtures plus `agent`: it runs a real coding agent in the
// project directory instead of calling the CLI directly, and reports what it ran.
export const it = base.extend<{
	agent: (prompt: string) => Promise<AgentResult>;
}>({
	agent: async ({ home, project, login }, use) => {
		await login();

		const binDir = new URL("bin/", home);
		const projectBinDir = new URL("node_modules/.bin/", project);

		// A `prismic` that runs the local built CLI, so the agent's `prismic ...` and
		// `npx prismic ...` calls hit this build instead of a global install or npm.
		// Installed both on PATH (for `prismic ...`) and in the project's
		// node_modules/.bin (for `npx prismic ...`, which ignores PATH).
		const shim = `#!/bin/sh\nexec node "${BIN}" "$@"\n`;
		await mkdir(projectBinDir, { recursive: true });
		for (const dir of [binDir, projectBinDir]) {
			await writeFile(new URL("prismic", dir), shim, { mode: 0o755 });
		}

		await use(async (prompt) => {
			const parentEnv = await claudeEnv();
			const env = {
				...parentEnv,
				HOME: fileURLToPath(home),
				PATH: `${fileURLToPath(binDir)}:${parentEnv.PATH}`,
				PRISMIC_CONFIG_DIR: fileURLToPath(new URL(".config/prismic/", home)),
				PRISMIC_TYPE_BUILDER_ENABLED: "true",
				PRISMIC_SENTRY_ENABLED: "false",
				PRISMIC_TELEMETRY_ENABLED: "false",
				NO_UPDATE_NOTIFIER: "1",
				CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
			};

			// Run the real Claude Code agent loop via the SDK. `settingSources: []` keeps
			// it generic — no personal skills, memory, MCP, or CLAUDE.md — and the guidance
			// is appended to the built-in system prompt. Auth is ANTHROPIC_API_KEY in `env`.
			const commands: string[] = [];
			let result: SDKResultMessage | undefined;
			for await (const message of query({
				prompt,
				options: {
					model: MODEL,
					cwd: fileURLToPath(project),
					systemPrompt: { type: "preset", preset: "claude_code", append: PRISMIC_GUIDANCE },
					permissionMode: "bypassPermissions",
					allowDangerouslySkipPermissions: true,
					settingSources: [],
					env,
				},
			})) {
				if (message.type === "assistant") {
					for (const block of message.message.content) {
						if (block.type === "tool_use" && block.name === "Bash") {
							const command = String((block.input as Record<string, unknown>).command ?? "");
							if (command) commands.push(command);
						}
					}
				} else if (message.type === "result") {
					result = message;
				}
			}

			if (!result) throw new Error("Agent produced no result message");
			if (result.subtype !== "success") throw new Error(`Agent run failed (${result.subtype})`);

			recordAgent(
				result,
				commands.filter((c) => /(^|\s)(npx\s+)?prismic(@|\s|$)/.test(c)),
			);
			return { commands };
		});
	},
});

expect.extend({
	toHaveRun(result: AgentResult, bin: string, positionals: string[] = []) {
		const pass = result.commands.some((command) => ranCommand(command, bin, positionals));
		return {
			pass,
			message: () => {
				const wanted = [bin, ...positionals].join(" ");
				if (pass) return `expected no command matching \`${wanted}\`, but one ran`;
				const seen = result.commands.map((c) => `  ${c}`).join("\n") || "  (no commands ran)";
				return `expected a command matching \`${wanted}\`, but saw:\n${seen}`;
			},
		};
	},

	async toSatisfyJudge(content: string, rubric: string, best = 0) {
		const loc = callSite();
		const { score, reason } = await judge(content, rubric);
		if (pending) pending.score = score;
		ratchet(loc, best, score);
		return {
			pass: score >= best - TOLERANCE,
			message: () =>
				`judge scored ${score} (bar ${best.toFixed(2)} − ${TOLERANCE} tolerance): ${reason}`,
		};
	},
});

// --- Ratchet: keep the bar honest without a human tuning numbers ---

// Bars that a run beat, collected to report at the end when not updating in place.
const raisable = new Set<string>();

// A run beat the bar, so the bar can rise. `candidate` is this run's score today; an
// averaging layer above this would call `ratchet` once with the median of several
// runs instead — nothing else here would change. Under `vitest -u` the new value is
// written into the test's `best` literal (like a snapshot); otherwise it's reported.
function ratchet(loc: CallSite, best: number, candidate: number): void {
	if (candidate <= best || !loc) return;
	if (updateMode()) raiseLiteral(loc, candidate);
	else raisable.add(`${loc.file.split("/").pop()}:${loc.line}  ${best} → ${candidate}`);
}

afterAll(() => {
	if (raisable.size === 0) return;
	console.info("\nBars can be raised (rerun with `node --run evals -- -u`):");
	for (const line of raisable) console.info(`  ${line}`);
});

type CallSite = { file: string; line: number } | undefined;

// The `.eval.ts` frame that called the matcher, so the ratchet can rewrite the right
// `best` literal.
function callSite(): CallSite {
	for (const frame of (new Error().stack ?? "").split("\n")) {
		const match = frame.match(/\(?(\/[^()]+\.eval\.ts):(\d+):\d+\)?/);
		if (match) return { file: match[1], line: Number(match[2]) };
	}
	return undefined;
}

// `vitest -u`. The default local mode is "new" (writes only missing snapshots); we
// only ratchet on an explicit update so a lucky run never silently raises the bar.
function updateMode(): boolean {
	// oxlint-disable-next-line no-explicit-any
	return (expect.getState().snapshotState as any)?._updateSnapshot === "all";
}

// Rewrite the `best` literal in the eval source. The literal must be a bare number on
// its own line (see the evals); scan down from the call and replace the first one.
// Replacing in place keeps line numbers stable for other evals ratcheting this run.
function raiseLiteral(loc: NonNullable<CallSite>, value: number): void {
	const lines = readFileSync(loc.file, "utf8").split("\n");
	for (let i = loc.line - 1; i < lines.length; i++) {
		const match = lines[i].match(/^(\s*)-?\d*\.?\d+(\s*,?\s*)$/);
		if (match) {
			lines[i] = `${match[1]}${value}${match[2]}`;
			writeFileSync(loc.file, lines.join("\n"));
			return;
		}
		if (lines[i].includes(");")) return;
	}
}

// --- Results: one row per eval, appended for later trend analysis (a small digest
// script, or an agent reading the log). Nothing reads it to gate a run — the
// assertions and the inline bar do that — so it holds only what a trend wants:
// effectiveness (pass, score) and effort (turns, tokens, duration). Cost is left out;
// it swings with model and provider pricing we don't control. Evals run serially (see
// vitest.config.ts), so one module-level accumulator is safe. ---

type Pending = {
	tokens: number;
	turns: number;
	durationMs: number;
	model: string;
	prismicCalls: string[];
	score?: number;
};

let pending: Pending | undefined;

// Accumulates so a multi-step eval records the whole task's usage, not just its last
// agent call. The judge's own usage is excluded — it is eval overhead, not the work.
function recordAgent(result: SDKResultMessage, prismicCalls: string[]): void {
	pending ??= { tokens: 0, turns: 0, durationMs: 0, model: MODEL, prismicCalls: [] };
	// Include cache tokens: with prompt caching most input is billed as cache reads,
	// so input_tokens alone drastically undercounts the run.
	pending.tokens +=
		result.usage.input_tokens +
		result.usage.output_tokens +
		result.usage.cache_read_input_tokens +
		result.usage.cache_creation_input_tokens;
	pending.turns += result.num_turns;
	pending.durationMs += result.duration_ms;
	pending.prismicCalls.push(...prismicCalls);
}

// Written after the test settles so `pass` reflects the final result. No-ops for a
// test that never ran the agent (nothing to record).
afterEach(({ task }) => {
	if (!pending) return;
	const row = { eval: task.name, pass: task.result?.state === "pass", ts: Date.now(), ...pending };
	appendFileSync(RESULTS_PATH, `${JSON.stringify(row)}\n`);
	pending = undefined;
});

// --- Helpers ---

// Does `command` invoke `bin` with the wanted positionals? Split on whitespace and
// find the binary (ignoring an `npx`/env prefix and a `@version` suffix); the
// positionals are the non-flag args after it, matched as a leading prefix.
function ranCommand(command: string, bin: string, positionals: string[]): boolean {
	const words = command.split(/\s+/).filter(Boolean);
	const start = words.findIndex((w) => w === bin || w.startsWith(`${bin}@`));
	if (start === -1) return false;

	const got = words.slice(start + 1).filter((w) => !w.startsWith("-"));
	return positionals.every((p, i) => got[i] === p);
}

const VerdictSchema = z.object({
	reason: z.string(),
	score: z.number(),
});

// Grade `content` against `rubric` with a fresh, tool-less SDK run returning a strict
// JSON verdict. `settingSources: []` keeps the judge generic, and the judge model is
// separate from the agent model so grading and doing are never the same run.
async function judge(content: string, rubric: string): Promise<z.infer<typeof VerdictSchema>> {
	const prompt = [
		"You are grading an AI agent's work against a rubric.",
		"First write a short reason, then score how well the work meets the rubric:",
		"1 = fully meets, 0.75 = mostly, 0.5 = partial, 0.25 = barely, 0 = fails.",
		'Respond with ONLY a JSON object, no prose, no code fences, reason first: {"reason": string, "score": number}.',
		"",
		"Rubric:",
		rubric,
		"",
		"Work to grade:",
		content,
	].join("\n");

	let text = "";
	for await (const message of query({
		prompt,
		options: {
			model: JUDGE_MODEL,
			systemPrompt: "You are a strict grader. Output only the requested JSON.",
			settingSources: [],
			allowedTools: [],
			maxTurns: 1,
			env: await claudeEnv(),
		},
	})) {
		if (message.type === "result" && message.subtype === "success") text = message.result;
	}
	if (!text) throw new Error("Judge produced no result");

	// The model is told to return bare JSON, but tolerate fences or surrounding prose
	// by grabbing the outermost object.
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end === -1) throw new Error(`Judge did not return JSON:\n${text}`);
	return VerdictSchema.parse(JSON.parse(text.slice(start, end + 1)));
}

// The agent and the judge would otherwise inherit the developer's real Claude config
// (settings, hooks, MCP servers, CLAUDE.md, skills), so the eval would measure that
// setup. Seed an empty throwaway config dir and authenticate via ANTHROPIC_API_KEY,
// so every run is a clean, generic agent. Built once and shared.
let configDir: Promise<string> | undefined;

async function claudeEnv(): Promise<Record<string, string>> {
	// Drop every CLAUDE* var (the parent session and its config dir) so the sub-agent
	// doesn't behave as a nested/resumed session, then point at the isolated config.
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined && !key.startsWith("CLAUDE")) env[key] = value;
	}
	env.CLAUDE_CONFIG_DIR = await (configDir ??= seedConfigDir());
	return env;
}

async function seedConfigDir(): Promise<string> {
	if (!process.env.ANTHROPIC_API_KEY) {
		throw new Error("ANTHROPIC_API_KEY is not set; add it to .env.test.local (see eval/DESIGN.md)");
	}
	// Empty config: no personal skills, memory, MCP servers, or CLAUDE.md. The
	// onboarding flag keeps the agent from prompting; auth comes from the API key.
	const dir = await mkdtemp(join(tmpdir(), "prismic-eval-claude-"));
	await writeFile(join(dir, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true }));
	await writeFile(join(dir, "settings.json"), "{}");
	return dir;
}
