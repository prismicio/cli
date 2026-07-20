import { query } from "@anthropic-ai/claude-agent-sdk";
import { fileURLToPath } from "node:url";
import { afterEach, expect } from "vitest";
import * as z from "zod/mini";

import type { AgentResult } from "./it";

import { claudeEnv } from "./claude";
import { flushRun, priorBest, recordScore } from "./report";

// Load secrets (ANTHROPIC_API_KEY) for local runs. In CI these come from the
// environment (a GitHub secret), so a missing file is fine.
try {
	process.loadEnvFile(fileURLToPath(new URL("../.env.test.local", import.meta.url)));
} catch {}

const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "claude-haiku-4-5-20251001";

declare module "vitest" {
	// oxlint-disable-next-line no-explicit-any
	interface Matchers<T = any> {
		// Assert the agent ran `bin` with `positionals` (a leading prefix). Matches
		// any command the agent ran, e.g. `npx prismic field add ...` or
		// `create-next-app ...`.
		toHaveRun(bin: string, positionals?: string[]): T;
		// Grade `content` (the agent's output, or a formatted trajectory) against a
		// natural-language rubric with an LLM judge. The judge returns a 0-1 score;
		// the test passes when it meets `threshold`.
		toSatisfyJudge(rubric: string, threshold?: number): Promise<T>;
	}
}

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

	async toSatisfyJudge(content: string, rubric: string, threshold?: number) {
		const { score, reason } = await judge(content, rubric);
		// No explicit threshold: ratchet against this eval's best prior score, minus a
		// tolerance that absorbs one bucket of judge noise. The bar only rises, so a
		// run passes unless it regresses below the best already achieved.
		const name = expect.getState().currentTestName ?? "";
		const effective = threshold ?? Math.max(0, priorBest(name) - 0.15);
		recordScore(score, effective);
		return {
			pass: score >= effective,
			message: () => `judge scored ${score} (threshold ${effective.toFixed(2)}): ${reason}`,
		};
	},
});

// One row per eval, written after the test settles so `pass` reflects the final
// result (the same pattern as screenshot-on-failure hooks).
afterEach(({ task }) => {
	flushRun(task.name, task.result?.state === "pass", Date.now());
});

// Does `command` invoke `bin` with the wanted positionals? Split on whitespace
// and find the binary (ignoring an `npx`/env prefix and a `@version` suffix); the
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

// Grade `content` against `rubric` with a fresh, tool-less SDK run returning a
// strict JSON verdict. `settingSources: []` keeps the judge generic, and the judge
// model is separate from the agent model so grading and doing are never the same run.
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

	// The model is told to return bare JSON, but tolerate fences or surrounding
	// prose by grabbing the outermost object.
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end === -1) {
		throw new Error(`Judge did not return JSON:\n${text}`);
	}
	return VerdictSchema.parse(JSON.parse(text.slice(start, end + 1)));
}
