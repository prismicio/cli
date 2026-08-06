import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import dedent from "dedent";
import { copyFile, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

import type { Trial } from "./reporter";

import { it as base } from "../test/it";
import { deleteRepository } from "../test/prismic";

if (process.env.PRISMIC_ALLOW_EVALS !== "true") {
	throw new Error(
		"Refusing to run evals outside an isolated environment. They run an agent with " +
			"--dangerously-skip-permissions against a real account. Set PRISMIC_ALLOW_EVALS=true " +
			"only inside a container or disposable VM.",
	);
}

const BIN = new URL("../dist/index.mjs", import.meta.url);
const EVAL_MODEL = process.env.EVAL_MODEL ?? "claude-sonnet-5";
const EVAL_TRIALS = Number(process.env.EVAL_TRIALS ?? 3);
const JUDGE_MODEL = "claude-sonnet-5";
const PRISMIC_SKILL_REF = "2bd340e6af4e67a9c1179e97b495f7bda564b46f";

const SKILL = await fetchSkill();

export const trials = Array.from({ length: EVAL_TRIALS }, (_, i) => i + 1);

declare module "vitest" {
	interface TaskMeta {
		agent?: Trial;
	}
	// oxlint-disable-next-line no-explicit-any
	interface Matchers<T = any> {
		toHaveRun(bin: string, positionals?: string[]): T;
		toSatisfyJudge(criterion: string): Promise<T>;
	}
}

export const it = base.extend<{
	agent: (prompt: string) => Promise<AgentResult>;
}>({
	agent: async ({ home, project, login, task, repo, token, host, password }, use) => {
		await login();

		const claudeConfigDir = await createClaudeConfigDir();

		const nodeModulesBinDir = new URL("node_modules/.bin/", project);
		await mkdir(nodeModulesBinDir, { recursive: true });
		await symlink(BIN, new URL("prismic", nodeModulesBinDir));

		const env = {
			...process.env,
			HOME: fileURLToPath(home),
			PRISMIC_CONFIG_DIR: fileURLToPath(new URL(".config/prismic/", home)),
			PRISMIC_TYPE_BUILDER_ENABLED: "true",
			PRISMIC_SENTRY_ENABLED: "false",
			PRISMIC_TELEMETRY_ENABLED: "false",
			NO_UPDATE_NOTIFIER: "1",
			CLAUDE_CONFIG_DIR: claudeConfigDir,
			CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
			CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
		};

		const trial: Trial = { model: EVAL_MODEL, costUsd: 0, durationS: 0, calls: [] };
		task.meta.agent = trial;
		let durationMs = 0;

		await use(async (prompt: string) => {
			const result = await agent(prompt, {
				systemPromptAppend: SKILL,
				cwd: project,
				env,
				// Recorded as commands stream so a timed-out trial keeps its trail.
				onCommand: (command) => {
					if (/(^|\s)(npx\s+)?prismic(@|\s|$)/.test(command)) {
						trial.calls.push(command.replace(/^.*?(^|\s)(npx\s+)?prismic(@\S+)?\s+/, ""));
					}
				},
			});

			const run = result.result;
			trial.costUsd += run.total_cost_usd;
			durationMs += run.duration_ms;
			trial.durationS = Math.round(durationMs / 1000);

			return result;
		});

		try {
			const configFile = await readFile(new URL("prismic.config.json", project), "utf8");
			const created = JSON.parse(configFile).repositoryName;
			if (created && created !== repo && password) {
				await deleteRepository(created, { token, password, host });
			}
		} catch {}
	},
});

it.scoped({ isolateRepo: true });

expect.extend({
	toHaveRun(result: AgentResult, bin: string, positionals: string[] = []) {
		const pass = result.commands.some((command) => {
			return command.split(/&&|\|\||;|\||\n/).some((segment) => {
				const words = segment.split(/\s+/).filter(Boolean);
				if (words.includes("--help") || words.includes("-h")) return false;
				const start = words.findIndex((word) => new RegExp(`^${bin}@?`).test(word));
				if (start === -1) return false;

				const got = words.slice(start + 1).filter((w) => !w.startsWith("-"));
				return positionals.every((p, i) => got[i] === p);
			});
		});

		return {
			pass,
			message: () => {
				const wanted = [bin, ...positionals].join(" ");
				if (pass) return `expected no command matching \`${wanted}\`, but one ran`;
				const seen = result.commands.map((c) => `  ${c}`).join("\n") || "  (no commands ran)";
				const final = "result" in result.result ? result.result.result : "";
				return `expected a command matching \`${wanted}\`, but saw:\n${seen}\n\nagent's final message:\n${final}`;
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

type AgentResult = {
	result: SDKResultMessage;
	commands: string[];
};

async function agent(
	prompt: string,
	config: {
		systemPromptAppend?: string;
		cwd: URL;
		env: NodeJS.ProcessEnv;
		onCommand?: (command: string) => void;
	},
) {
	const { systemPromptAppend, cwd, env, onCommand } = config;

	let result: SDKResultMessage | undefined;
	const commands: string[] = [];

	for await (const message of query({
		prompt,
		options: {
			model: EVAL_MODEL,
			systemPrompt: {
				type: "preset",
				preset: "claude_code",
				append: systemPromptAppend,
			},
			permissionMode: "bypassPermissions",
			allowDangerouslySkipPermissions: true,
			settingSources: [],
			persistSession: false,
			cwd: fileURLToPath(cwd),
			env,
		},
	})) {
		if (message.type === "result") result = message;
		if (message.type === "assistant") {
			for (const block of message.message.content) {
				if (block.type === "tool_use" && block.name === "Bash") {
					const command = (block.input as { command?: string }).command;
					if (typeof command !== "string") continue;
					commands.push(command);
					onCommand?.(command);
				}
			}
		}
	}

	if (result?.subtype !== "success") {
		throw new Error(`Agent run failed (${result?.subtype ?? "no result message"})`);
	}

	return { result, commands };
}

async function judge(
	content: string,
	criterion: string,
): Promise<{ reason: string; pass: boolean }> {
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

	let result: SDKResultMessage | undefined;
	for await (const message of query({
		prompt,
		options: {
			model: JUDGE_MODEL,
			systemPrompt: "You are a strict grader.",
			allowedTools: [],
			persistSession: false,
			settingSources: [],
			outputFormat: {
				type: "json_schema",
				schema: {
					type: "object",
					properties: { reason: { type: "string" }, pass: { type: "boolean" } },
					required: ["reason", "pass"],
					additionalProperties: false,
				},
			},
		},
	})) {
		if (message.type === "result") result = message;
	}

	if (result?.subtype !== "success") {
		throw new Error(`Judge run failed (${result?.subtype ?? "no result message"})`);
	}

	return result.structured_output as { reason: string; pass: boolean };
}

async function fetchSkill() {
	const response = await fetch(
		`https://raw.githubusercontent.com/prismicio/skills/${PRISMIC_SKILL_REF}/skills/prismic/SKILL.md`,
	);
	if (!response.ok) throw new Error(`Prismic skill fetch failed (${response.status})`);
	const text = await response.text();
	return text.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
}

async function createClaudeConfigDir() {
	const claudeConfigDir = await mkdtemp(join(tmpdir(), "prismic-eval-claude-"));
	await writeFile(
		join(claudeConfigDir, ".claude.json"),
		JSON.stringify({ hasCompletedOnboarding: true }),
	);
	await writeFile(join(claudeConfigDir, "settings.json"), JSON.stringify({}));
	if (!process.env.ANTHROPIC_API_KEY) {
		// Copy subscription credentials
		const source = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
		try {
			await copyFile(join(source, ".credentials.json"), join(claudeConfigDir, ".credentials.json"));
		} catch {}
	}
	return claudeConfigDir;
}
