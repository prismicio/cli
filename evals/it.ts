import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { Codex } from "@openai/codex-sdk";
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
const EVAL_TRIALS = Number(process.env.EVAL_TRIALS ?? 3);
const JUDGE_MODEL = "claude-sonnet-5";
const PRISMIC_SKILL_REF = "2a2f940865c266fc62eb396d9883b072598d8de0";

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
	installSkill: boolean;
	installCli: boolean;
	model: string;
	agent: (prompt: string) => Promise<AgentResult>;
}>({
	installSkill: true,
	installCli: true,
	model: "claude-sonnet-5",
	agent: async (
		{ home, project, login, task, repo, token, host, password, installSkill, installCli, model },
		use,
	) => {
		await login();

		const env: NodeJS.ProcessEnv = {
			...process.env,
			HOME: fileURLToPath(home),
			NO_UPDATE_NOTIFIER: "1",
			CLAUDE_CONFIG_DIR: await createClaudeConfigDir(),
			CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
			CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
			CODEX_HOME: await createCodexHome(),
		};

		if (installCli) {
			const nodeModulesBinDir = new URL("node_modules/.bin/", project);
			await mkdir(nodeModulesBinDir, { recursive: true });
			await symlink(BIN, new URL("prismic", nodeModulesBinDir));
			env.PRISMIC_CONFIG_DIR = fileURLToPath(new URL(".config/prismic/", home));
			env.PRISMIC_TYPE_BUILDER_ENABLED = "true";
			env.PRISMIC_SENTRY_ENABLED = "false";
			env.PRISMIC_TELEMETRY_ENABLED = "false";
		}

		const trial: Trial = { model, tokens: 0, durationS: 0, calls: [] };
		task.meta.agent = trial;
		let durationMs = 0;

		const run = model.startsWith("claude-") ? runClaudeCode : runCodex;

		await use(async (prompt: string) => {
			const start = performance.now();
			const commands: string[] = [];
			const { text, tokens } = await run(prompt, {
				model,
				skill: installSkill ? SKILL : undefined,
				cwd: project,
				env,
				// Recorded as commands stream so a timed-out trial keeps its trail.
				onCommand: (command) => {
					commands.push(command);
					if (/(^|\s)(npx\s+)?prismic(@|\s|$)/.test(command)) {
						trial.calls.push(command.replace(/^.*?(^|\s)(npx\s+)?prismic(@\S+)?(?=\s|$)\s*/, ""));
					}
				},
			});

			durationMs += performance.now() - start;
			trial.tokens += tokens;
			trial.durationS = Math.round(durationMs / 1000);

			return { text, commands };
		});

		for (const file of ["prismic.config.json", "slicemachine.config.json"]) {
			try {
				const configFile = await readFile(new URL(file, project), "utf8");
				const created = JSON.parse(configFile).repositoryName;
				if (created && created !== repo && password) {
					await deleteRepository(created, { token, password, host });
				}
			} catch {}
		}
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
				return `expected a command matching \`${wanted}\`, but saw:\n${seen}\n\nagent's final message:\n${result.text}`;
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
	text: string;
	commands: string[];
};

type RunOptions = {
	model: string;
	skill?: string;
	cwd: URL;
	env: NodeJS.ProcessEnv;
	onCommand: (command: string) => void;
};

async function runClaudeCode(prompt: string, { model, skill, cwd, env, onCommand }: RunOptions) {
	let result: SDKResultMessage | undefined;

	for await (const message of query({
		prompt,
		options: {
			model,
			systemPrompt: { type: "preset", preset: "claude_code", append: skill },
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
					onCommand(command);
				}
			}
		}
	}

	if (result?.subtype !== "success") {
		throw new Error(`Agent run failed (${result?.subtype ?? "no result message"})`);
	}

	const { usage } = result;
	const tokens =
		usage.input_tokens +
		usage.cache_read_input_tokens +
		usage.cache_creation_input_tokens +
		usage.output_tokens;

	return { text: result.result, tokens };
}

async function runCodex(prompt: string, { model, skill, cwd, env, onCommand }: RunOptions) {
	if (skill) await writeFile(new URL("AGENTS.md", cwd), skill);

	const codex = new Codex({
		apiKey: process.env.OPENAI_API_KEY,
		env: env as Record<string, string>,
	});
	const thread = codex.startThread({
		model,
		workingDirectory: fileURLToPath(cwd),
		sandboxMode: "danger-full-access",
		approvalPolicy: "never",
		skipGitRepoCheck: true,
	});

	let text = "";
	let tokens = 0;

	const { events } = await thread.runStreamed(prompt);
	for await (const event of events) {
		if (event.type === "item.started" && event.item.type === "command_execution") {
			onCommand(event.item.command);
		}
		if (event.type === "item.completed" && event.item.type === "agent_message") {
			text = event.item.text;
		}
		if (event.type === "turn.completed") {
			tokens = event.usage.input_tokens + event.usage.output_tokens;
		}
		if (event.type === "turn.failed") {
			throw new Error(`Agent run failed (${event.error.message})`);
		}
	}

	return { text, tokens };
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

async function createCodexHome() {
	const codexHome = await mkdtemp(join(tmpdir(), "prismic-eval-codex-"));
	if (!process.env.OPENAI_API_KEY) {
		const source = process.env.CODEX_HOME ?? join(homedir(), ".codex");
		try {
			await copyFile(join(source, "auth.json"), join(codexHome, "auth.json"));
		} catch {}
	}
	return codexHome;
}
