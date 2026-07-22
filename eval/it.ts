import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import dedent from "dedent";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Result, x } from "tinyexec";
import { expect } from "vitest";
import * as z from "zod/mini";

import { it as base } from "../test/it";

const BIN = new URL("../dist/index.mjs", import.meta.url);

const env = z
	.object({
		PATH: z.string(),
		ANTHROPIC_API_KEY: z.string(),
		EVAL_MODEL: z._default(z.string(), "claude-sonnet-5"),
		EVAL_JUDGE_MODEL: z._default(z.string(), "claude-haiku-4-5-20251001"),
		EVAL_TRIALS: z._default(z.coerce.number(), 3),
	})
	.parse(process.env);

// Each eval registers once per trial via `it.for(trials)`, so every trial is a
// separate test with fresh fixtures. Trials share the eval's name; the reporter
// groups rows by name into per-eval pass rates.
export const trials = Array.from({ length: env.EVAL_TRIALS }, (_, i) => i + 1);

const PRISMIC_GUIDANCE = dedent`
	The \`prismic\` CLI manages Prismic content models, repository settings, and docs.
	1. Always run commands via \`npx prismic\`. Do not guess command syntax.
	2. Start with \`npx prismic --help\`; inspect details with \`npx prismic <command> --help\`.
	3. Use \`npx prismic docs list\` and \`npx prismic docs view <path>\` for documentation.
	4. Prefer CLI workflows. Never directly edit model JSON files — always use the CLI.
	5. If the CLI cannot do something, say so instead of working around it.
`;

type AgentRecord = {
	tokens: number;
	costUsd: number;
	turns: number;
	durationMs: number;
	model: string;
	prismicCalls: string[];
	infra?: boolean;
};

declare module "vitest" {
	// oxlint-disable-next-line no-explicit-any
	interface Matchers<T = any> {
		toHaveRun(bin: string, positionals?: string[]): T;
		toSatisfyJudge(criterion: string): Promise<T>;
	}

	interface TaskMeta {
		agent?: AgentRecord;
	}
}

export const it = base.extend<{
	agent: (prompt: string) => Promise<string[]>;
	git: (...args: string[]) => Result;
	isolateRepo: boolean;
}>({
	// Evals run concurrently and agents may push to or mutate the repository,
	// so each test gets its own instead of the shared one.
	isolateRepo: true,
	git: async ({ project, home }, use) => {
		await use((...args) =>
			x("git", args, {
				throwOnError: true,
				nodeOptions: {
					cwd: fileURLToPath(project),
					env: { ...process.env, HOME: fileURLToPath(home) },
				},
			}),
		);
	},
	agent: async ({ home, project, login, task }, use) => {
		await login();

		const binDir = new URL("bin/", home);
		const projectBinDir = new URL("node_modules/.bin/", project);

		const shim = `#!/bin/sh\nexec node "${fileURLToPath(BIN)}" "$@"\n`;
		await mkdir(projectBinDir, { recursive: true });
		for (const dir of [binDir, projectBinDir]) {
			await writeFile(new URL("prismic", dir), shim, { mode: 0o755 });
		}

		const record: AgentRecord = {
			tokens: 0,
			costUsd: 0,
			turns: 0,
			durationMs: 0,
			model: env.EVAL_MODEL,
			prismicCalls: [],
		};

		await use(async (prompt) => {
			const claudeConfig = await createTempClaudeConfigDir();

			try {
				const commands: string[] = [];
				let result: SDKResultMessage | undefined;
				for await (const message of query({
					prompt,
					options: {
						model: env.EVAL_MODEL,
						cwd: fileURLToPath(project),
						systemPrompt: { type: "preset", preset: "claude_code", append: PRISMIC_GUIDANCE },
						permissionMode: "bypassPermissions",
						allowDangerouslySkipPermissions: true,
						settingSources: [],
						persistSession: false,
						env: {
							...process.env,
							HOME: fileURLToPath(home),
							PATH: `${fileURLToPath(binDir)}:${env.PATH}`,
							PRISMIC_CONFIG_DIR: fileURLToPath(new URL(".config/prismic/", home)),
							PRISMIC_TYPE_BUILDER_ENABLED: "true",
							PRISMIC_SENTRY_ENABLED: "false",
							PRISMIC_TELEMETRY_ENABLED: "false",
							NO_UPDATE_NOTIFIER: "1",
							CLAUDE_CONFIG_DIR: claudeConfig,
							CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
						},
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

				record.tokens +=
					result.usage.input_tokens +
					result.usage.output_tokens +
					result.usage.cache_read_input_tokens +
					result.usage.cache_creation_input_tokens;
				record.costUsd += result.total_cost_usd;
				record.turns += result.num_turns;
				record.durationMs += result.duration_ms;
				record.prismicCalls.push(
					...commands.filter((c) => /(^|\s)(npx\s+)?prismic(@|\s|$)/.test(c)),
				);
				return commands;
			} catch (error) {
				// The agent harness failed before the eval could be graded; the
				// reporter excludes these trials from pass rates.
				record.infra = true;
				throw error;
			} finally {
				await rm(claudeConfig, { recursive: true, force: true });
			}
		});

		task.meta.agent = record;
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

	async toSatisfyJudge(content: string, criterion: string) {
		const { pass, reason } = await judge(content, criterion);
		return {
			pass,
			message: () => `judge: ${reason}`,
		};
	},
});

async function createTempClaudeConfigDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "prismic-eval-claude-"));
	await writeFile(join(dir, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true }));
	await writeFile(join(dir, "settings.json"), "{}");
	return dir;
}

// Evaluates each shell segment separately so `prismic push --help` in a
// compound command neither counts as running `push` nor hides a real run.
function ranCommand(command: string, bin: string, positionals: string[]): boolean {
	return command.split(/&&|\|\||;|\||\n/).some((segment) => {
		const words = segment.split(/\s+/).filter(Boolean);
		if (words.includes("--help") || words.includes("-h")) return false;
		const start = words.findIndex((w) => w === bin || w.startsWith(`${bin}@`));
		if (start === -1) return false;

		const got = words.slice(start + 1).filter((w) => !w.startsWith("-"));
		return positionals.every((p, i) => got[i] === p);
	});
}

async function judge(content: string, criterion: string): Promise<z.infer<typeof VerdictSchema>> {
	const prompt = dedent`
		You are judging an AI agent's work against a criterion.
		First write a short reason, then decide whether the work satisfies the criterion.

		<criterion>
		${criterion}
		</criterion>

		<work>
		${content}
		</work>
	`;

	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"x-api-key": env.ANTHROPIC_API_KEY,
			"anthropic-version": "2023-06-01",
			"content-type": "application/json",
		},
		body: JSON.stringify({
			model: env.EVAL_JUDGE_MODEL,
			max_tokens: 1024,
			system: "You are a strict grader.",
			messages: [{ role: "user", content: prompt }],
			output_config: { format: { type: "json_schema", schema: VerdictJsonSchema } },
		}),
	});
	if (!response.ok) {
		throw new Error(`Judge request failed (${response.status}): ${await response.text()}`);
	}
	const message = MessageSchema.parse(await response.json());
	const verdict = message.content.find((block) => block.type === "text")?.text;
	if (verdict === undefined) throw new Error("Judge returned no text block");
	return VerdictSchema.parse(JSON.parse(verdict));
}

const VerdictSchema = z.strictObject({
	reason: z.string(),
	pass: z.boolean(),
});
const VerdictJsonSchema: Record<string, unknown> = z.toJSONSchema(VerdictSchema);
delete VerdictJsonSchema.$schema;

const MessageSchema = z.object({
	content: z.array(z.object({ type: z.string(), text: z.optional(z.string()) })),
});
