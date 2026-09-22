import dedent from "dedent";
import { describe } from "vitest";

import { buildCustomType, writeLocalCustomType } from "../test/it";
import { it, trials } from "./it";

type Agent = (prompt: string) => Promise<{ calls: string[][] }>;
type Request = { prompt: string; calls: string[][] };

const TASK_ID = /^pt_[0-9a-hjkmnp-tv-z]{16}$/;

const PROMPTS = [
	`Using the Prismic CLI, create a "call to action" slice with a heading, body text, and a button label, then add it to the "article" type.`,
	`Using the Prismic CLI, add a "published_at" date field to the "article" type.`,
];

describe.for([
	{ name: "with the skill", installSkill: true },
	{ name: "without the skill", installSkill: false },
])("$name", ({ installSkill }) => {
	it.scoped({ installSkill });

	it.for(trials)("gives each request its own task id", async (_, { project, agent, expect }) => {
		await writeLocalCustomType(project, buildCustomType({ id: "article", label: "Article" }));

		const requests = await runRequests(agent, PROMPTS);
		const seen = report(requests);

		const ids = requests.map(({ calls }) => {
			const unique = [...new Set(calls.filter(accepted).map(taskIdOf))];
			expect(unique, seen).toHaveLength(1);
			return unique[0];
		});
		expect(new Set(ids).size, seen).toBe(requests.length);

		for (const { prompt, calls } of requests) {
			for (const intent of new Set(calls.filter(accepted).map(intentOf))) {
				await expect(intent).toSatisfyJudge(dedent`
					The user asked an agent: ${prompt}
					Above is the value the agent passed as the intent to the Prismic CLI.
					Passes if it paraphrases that request in one short sentence.
					Fails if it is empty, is a placeholder, describes a single CLI command rather than the
					whole request, or describes a different request.
				`);
			}
		}
	});
});

async function runRequests(agent: Agent, prompts: string[]): Promise<Request[]> {
	const requests: Request[] = [];
	let alreadySeen = 0;

	for (const prompt of prompts) {
		const { calls: callsSoFar } = await agent(prompt);
		requests.push({ prompt, calls: callsSoFar.slice(alreadySeen).filter(needsTaskId) });
		alreadySeen = callsSoFar.length;
	}

	return requests;
}

function report(requests: Request[]): string {
	return requests
		.flatMap(({ calls }, index) => [
			`request ${index + 1}:`,
			...calls.map(
				(argv) =>
					`  ${argv.find((arg) => !arg.startsWith("--")) ?? "?"} -> id=${taskIdOf(argv) ?? "none"} intent=${JSON.stringify(intentOf(argv) ?? null)}`,
			),
		])
		.join("\n");
}

function needsTaskId(argv: string[]): boolean {
	return (
		argv[0] !== "task-id" && !argv.some((arg) => ["--help", "-h", "--version", "-v"].includes(arg))
	);
}

function accepted(argv: string[]): boolean {
	return Boolean(intentOf(argv)) && TASK_ID.test(taskIdOf(argv) ?? "");
}

function taskIdOf(argv: string[]): string | undefined {
	return optionValue(argv, "task-id") ?? optionValue(argv, "analytics-task-id");
}

function intentOf(argv: string[]): string | undefined {
	return optionValue(argv, "user-intent") ?? optionValue(argv, "analytics-intent");
}

function optionValue(argv: string[], name: string): string | undefined {
	const index = argv.indexOf(`--${name}`);
	if (index !== -1) return argv[index + 1];
	return argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}
