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

try {
	process.loadEnvFile(fileURLToPath(new URL("../.env.test.local", import.meta.url)));
} catch {}

const BIN = fileURLToPath(new URL("../dist/index.mjs", import.meta.url));
const RESULTS_PATH = fileURLToPath(new URL("results.jsonl", import.meta.url));
const MODEL = process.env.EVAL_MODEL ?? "claude-sonnet-5";
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "claude-haiku-4-5-20251001";
const TOLERANCE = 0.15;

const PRISMIC_GUIDANCE = dedent`
	The \`prismic\` CLI manages Prismic content models, repository settings, and docs.
	1. Always run commands via \`npx prismic\`. Do not guess command syntax.
	2. Start with \`npx prismic --help\`; inspect details with \`npx prismic <command> --help\`.
	3. Use \`npx prismic docs list\` and \`npx prismic docs view <path>\` for documentation.
	4. Prefer CLI workflows. Never directly edit model JSON files — always use the CLI.
	5. If the CLI cannot do something, say so instead of working around it.
`;

export type AgentResult = {
	commands: string[];
};

declare module "vitest" {
	// oxlint-disable-next-line no-explicit-any
	interface Matchers<T = any> {
		toHaveRun(bin: string, positionals?: string[]): T;
		toSatisfyJudge(rubric: string, best?: number): Promise<T>;
	}
}

export const it = base.extend<{
	agent: (prompt: string) => Promise<AgentResult>;
}>({
	agent: async ({ home, project, login }, use) => {
		await login();

		const binDir = new URL("bin/", home);
		const projectBinDir = new URL("node_modules/.bin/", project);

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

const raisable = new Set<string>();

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

function callSite(): CallSite {
	for (const frame of (new Error().stack ?? "").split("\n")) {
		const match = frame.match(/\(?(\/[^()]+\.eval\.ts):(\d+):\d+\)?/);
		if (match) return { file: match[1], line: Number(match[2]) };
	}
	return undefined;
}

function updateMode(): boolean {
	// oxlint-disable-next-line no-explicit-any
	return (expect.getState().snapshotState as any)?._updateSnapshot === "all";
}

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

type Pending = {
	tokens: number;
	turns: number;
	durationMs: number;
	model: string;
	prismicCalls: string[];
	score?: number;
};

let pending: Pending | undefined;

function recordAgent(result: SDKResultMessage, prismicCalls: string[]): void {
	pending ??= { tokens: 0, turns: 0, durationMs: 0, model: MODEL, prismicCalls: [] };
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
	score: z.number(),
});

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

	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end === -1) throw new Error(`Judge did not return JSON:\n${text}`);
	return VerdictSchema.parse(JSON.parse(text.slice(start, end + 1)));
}

let configDir: Promise<string> | undefined;

async function claudeEnv(): Promise<Record<string, string>> {
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
	const dir = await mkdtemp(join(tmpdir(), "prismic-eval-claude-"));
	await writeFile(join(dir, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true }));
	await writeFile(join(dir, "settings.json"), "{}");
	return dir;
}
