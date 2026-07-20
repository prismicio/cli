import { query, type SDKMessage, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import dedent from "dedent";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { it as base } from "../test/it";

import { claudeEnv } from "./claude";
import { recordAgent } from "./report";

const BIN = fileURLToPath(new URL("../dist/index.mjs", import.meta.url));
const MODEL = process.env.EVAL_MODEL ?? "claude-sonnet-5";

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

export type ToolUse = { name: string; input: Record<string, unknown> };

export type AgentResult = {
	// Every tool the agent used, in order (Bash, Read, Edit, MCP calls, ...).
	trajectory: ToolUse[];
	// Every shell command the agent ran, generic across binaries (Bash tool_use):
	// `prismic ...`, `npx create-next-app`, `git`, etc.
	commands: string[];
};

// The existing test fixtures plus `agent`: it runs a real coding agent in the
// project directory instead of calling the CLI directly, and reports what it did.
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
			const messages: SDKMessage[] = [];
			const trajectory: ToolUse[] = [];
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
				messages.push(message);
				if (message.type === "assistant") {
					for (const block of message.message.content) {
						if (block.type === "tool_use") {
							trajectory.push({ name: block.name, input: block.input as Record<string, unknown> });
						}
					}
				} else if (message.type === "result") {
					result = message;
				}
			}

			if (!result) throw new Error("Agent produced no result message");
			if (result.subtype !== "success") throw new Error(`Agent run failed (${result.subtype})`);

			const commands = trajectory
				.filter((t) => t.name === "Bash")
				.map((t) => String(t.input.command ?? ""))
				.filter((c) => c.length > 0);
			const prismicCalls = commands.filter((c) => /(^|\s)(npx\s+)?prismic(@|\s|$)/.test(c));
			recordAgent(
				{
					// Include cache tokens: with prompt caching, most input is billed as
					// cache reads, so input_tokens alone drastically undercounts the run.
					tokens:
						result.usage.input_tokens +
						result.usage.output_tokens +
						result.usage.cache_read_input_tokens +
						result.usage.cache_creation_input_tokens,
					turns: result.num_turns,
					costUsd: result.total_cost_usd,
					durationMs: result.duration_ms,
				},
				MODEL,
				prismicCalls,
			);

			// Dump the full structured run next to the eval files for introspection.
			if (process.env.EVAL_DEBUG) {
				await writeFile(new URL("last-run.json", import.meta.url), JSON.stringify(messages, null, 2));
			}

			return { trajectory, commands };
		});
	},
});
