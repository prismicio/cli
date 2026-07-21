import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import dedent from "dedent";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, expect } from "vitest";
import * as z from "zod/mini";

import { it as base } from "../test/it";

const BIN = new URL("../dist/index.mjs", import.meta.url);
const RESULTS_PATH = new URL("results.jsonl", import.meta.url);
const MODEL = process.env.EVAL_MODEL ?? "claude-sonnet-5";
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "claude-haiku-4-5-20251001";

const PRISMIC_GUIDANCE = dedent`
	The \`prismic\` CLI manages Prismic content models, repository settings, and docs.
	1. Always run commands via \`npx prismic\`. Do not guess command syntax.
	2. Start with \`npx prismic --help\`; inspect details with \`npx prismic <command> --help\`.
	3. Use \`npx prismic docs list\` and \`npx prismic docs view <path>\` for documentation.
	4. Prefer CLI workflows. Never directly edit model JSON files — always use the CLI.
	5. If the CLI cannot do something, say so instead of working around it.
`;

declare module "vitest" {
	// oxlint-disable-next-line no-explicit-any
	interface Matchers<T = any> {
		toHaveRun(bin: string, positionals?: string[]): T;
		toSatisfyJudge(rubric: string, best?: number): Promise<T>;
	}
}

export const it = base.extend<{
	agent: (prompt: string) => Promise<string[]>;
}>({
	agent: async ({ home, project, login }, use) => {
		await login();

		const binDir = new URL("bin/", home);
		const projectBinDir = new URL("node_modules/.bin/", project);

		const shim = `#!/bin/sh\nexec node "${fileURLToPath(BIN)}" "$@"\n`;
		await mkdir(projectBinDir, { recursive: true });
		for (const dir of [binDir, projectBinDir]) {
			await writeFile(new URL("prismic", dir), shim, { mode: 0o755 });
		}

		await use(async (prompt) => {
			const claudeConfig = await createTempClaudeConfigDir();
			const env = {
				...process.env,
				HOME: fileURLToPath(home),
				PATH: `${fileURLToPath(binDir)}:${process.env.PATH}`,
				PRISMIC_CONFIG_DIR: fileURLToPath(new URL(".config/prismic/", home)),
				PRISMIC_TYPE_BUILDER_ENABLED: "true",
				PRISMIC_SENTRY_ENABLED: "false",
				PRISMIC_TELEMETRY_ENABLED: "false",
				NO_UPDATE_NOTIFIER: "1",
				CLAUDE_CONFIG_DIR: claudeConfig,
				CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
			};

			try {
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
						persistSession: false,
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
				return commands;
			} finally {
				await rm(claudeConfig, { recursive: true, force: true });
			}
		});
	},
});

expect.extend({
	toHaveRun(commands: string[], bin: string, positionals: string[] = []) {
		const pass = commands.some((command) => ranCommand(command, bin, positionals));
		return {
			pass,
			message: () => {
				const wanted = [bin, ...positionals].join(" ");
				if (pass) return `expected no command matching \`${wanted}\`, but one ran`;
				const seen = commands.map((c) => `  ${c}`).join("\n") || "  (no commands ran)";
				return `expected a command matching \`${wanted}\`, but saw:\n${seen}`;
			},
		};
	},

	async toSatisfyJudge(content: string, rubric: string, best = 0) {
		const loc = callSite();
		const { score, reason } = await judge(content, rubric);
		pending ??= newPending();
		pending.score = score;
		ratchet(loc, best, score);
		return {
			pass: score >= best,
			message: () => `judge scored ${score} (bar ${best}): ${reason}`,
		};
	},
});

const raisable = new Set<string>();

// vitest's -u/--update flag. Read from snapshot state, not process.argv, which
// is empty in the worker process that runs the tests.
function updateMode(): boolean {
	const snapshot = expect.getState().snapshotState as unknown as { _updateSnapshot?: string };
	return snapshot?._updateSnapshot === "all";
}

function ratchet(loc: CallSite | undefined, best: number, candidate: number): void {
	if (candidate <= best || !loc) return;
	if (updateMode()) raiseLiteral(loc, candidate);
	else raisable.add(`${loc.file.split("/").pop()}:${loc.line}  ${best} → ${candidate}`);
}

afterAll(() => {
	if (raisable.size === 0) return;
	console.info("\nBars can be raised (rerun with `node --run evals -- -u`):");
	for (const line of raisable) console.info(`  ${line}`);
});

type CallSite = { file: string; line: number };

function callSite(): CallSite | undefined {
	for (const frame of (new Error().stack ?? "").split("\n")) {
		const match = frame.match(/\(?(\/[^()]+\.eval\.ts):(\d+):\d+\)?/);
		if (match) return { file: match[1], line: Number(match[2]) };
	}
	return undefined;
}

function raiseLiteral(loc: CallSite, value: number): void {
	const lines = readFileSync(loc.file, "utf8").split("\n");
	for (let i = loc.line - 1; i < lines.length; i++) {
		const match =
			lines[i].match(/^(\s*)-?\d*\.?\d+(\s*,?\s*)$/) ??
			lines[i].match(/^(.*,\s*)-?\d*\.?\d+(\s*\)[\s;]*)$/);
		if (match) {
			lines[i] = `${match[1]}${value}${match[2]}`;
			writeFileSync(loc.file, lines.join("\n"));
			return;
		}
		if (lines[i].includes(");")) return;
	}
}

type Pending = {
	tokens: number;
	turns: number;
	durationMs: number;
	model: string;
	prismicCalls: string[];
	score?: number;
};

let pending: Pending | undefined;

const newPending = (): Pending => ({
	tokens: 0,
	turns: 0,
	durationMs: 0,
	model: MODEL,
	prismicCalls: [],
});

function recordAgent(result: SDKResultMessage, prismicCalls: string[]): void {
	pending ??= newPending();
	pending.tokens +=
		result.usage.input_tokens +
		result.usage.output_tokens +
		result.usage.cache_read_input_tokens +
		result.usage.cache_creation_input_tokens;
	pending.turns += result.num_turns;
	pending.durationMs += result.duration_ms;
	pending.prismicCalls.push(...prismicCalls);
}

afterEach(({ task }) => {
	if (!pending) return;
	const row = { eval: task.name, pass: task.result?.state === "pass", ts: Date.now(), ...pending };
	appendFileSync(RESULTS_PATH, `${JSON.stringify(row)}\n`);
	pending = undefined;
});

function ranCommand(command: string, bin: string, positionals: string[]): boolean {
	const words = command.split(/\s+/).filter(Boolean);
	const start = words.findIndex((w) => w === bin || w.startsWith(`${bin}@`));
	if (start === -1) return false;

	const got = words.slice(start + 1).filter((w) => !w.startsWith("-"));
	return positionals.every((p, i) => got[i] === p);
}

const VerdictSchema = z.object({
	reason: z.string(),
	score: z.number().check(z.minimum(0), z.maximum(1)),
});
const VerdictJsonSchema: Record<string, unknown> = z.toJSONSchema(VerdictSchema);
delete VerdictJsonSchema.$schema;

async function judge(content: string, rubric: string): Promise<z.infer<typeof VerdictSchema>> {
	const prompt = dedent`
		You are grading an AI agent's work against the rubric.
		First write a short reason, then score how well the work meets the rubric:
		1 = fully meets, 0.75 = mostly, 0.5 = partial, 0.25 = barely, 0 = fails.

		<rubric>
		${rubric}
		</rubric>

		<work>
		${content}
		</work>
	`;

	const claudeConfig = await createTempClaudeConfigDir();
	let verdict: unknown;
	try {
		for await (const message of query({
			prompt,
			options: {
				model: JUDGE_MODEL,
				systemPrompt: "You are a strict grader.",
				settingSources: [],
				allowedTools: [],
				maxTurns: 2,
				persistSession: false,
				outputFormat: { type: "json_schema", schema: VerdictJsonSchema },
				env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfig, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" },
			},
		})) {
			if (message.type === "result" && message.subtype === "success") verdict = message.structured_output;
		}
	} finally {
		await rm(claudeConfig, { recursive: true, force: true });
	}
	if (verdict === undefined) throw new Error("Judge produced no result");
	return VerdictSchema.parse(verdict);
}

async function createTempClaudeConfigDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "prismic-eval-claude-"));
	await writeFile(join(dir, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true }));
	await writeFile(join(dir, "settings.json"), "{}");
	return dir;
}
