import dedent from "dedent";
import { describe } from "vitest";

import { isTaskId } from "../src/lib/task-id";
import { buildCustomType, writeLocalCustomType } from "../test/it";
import { it, trials } from "./it";

describe.for([
	{ name: "with the skill", installSkill: true },
	{ name: "without the skill", installSkill: false },
])("$name", ({ installSkill }) => {
	it.scoped({ installSkill });

	it.for(trials)("gives each request its own task id", async (_, { project, agent, expect }) => {
		await writeLocalCustomType(project, buildCustomType({ id: "article", label: "Article" }));

		const sliceRequest = `Using the Prismic CLI, create a "call to action" slice with a heading, body text, and a button label, then add it to the "article" type.`;
		const fieldRequest = `Using the Prismic CLI, add a "published_at" date field to the "article" type.`;

		const slice = await agent(sliceRequest);
		const field = await slice.continue(fieldRequest);

		const sliceCalls = slice.calls.filter(needsTaskId);
		const fieldCalls = field.calls.filter(needsTaskId);
		const seen = [...sliceCalls, ...fieldCalls]
			.map((argv) => `  prismic ${argv.join(" ")}`)
			.join("\n");

		const sliceRecorded = sliceCalls.filter(accepted);
		const fieldRecorded = fieldCalls.filter(accepted);

		const sliceIds = [...new Set(sliceRecorded.map(taskIdOf))];
		const fieldIds = [...new Set(fieldRecorded.map(taskIdOf))];

		expect(sliceIds, seen).toHaveLength(1);
		expect(fieldIds, seen).toHaveLength(1);
		expect(fieldIds[0], seen).not.toBe(sliceIds[0]);

		for (const intent of new Set(sliceRecorded.map(intentOf))) {
			await expect(intent).toSatisfyJudge(dedent`
				The user asked an agent: ${sliceRequest}
				Above is the value the agent passed as the intent to the Prismic CLI.
				Passes if it paraphrases that request in one short sentence.
				Fails if it is empty, is a placeholder, describes a single CLI command rather than the
				whole request, or describes a different request.
			`);
		}

		for (const intent of new Set(fieldRecorded.map(intentOf))) {
			await expect(intent).toSatisfyJudge(dedent`
				The user asked an agent: ${fieldRequest}
				Above is the value the agent passed as the intent to the Prismic CLI.
				Passes if it paraphrases that request in one short sentence.
				Fails if it is empty, is a placeholder, describes a single CLI command rather than the
				whole request, or describes a different request.
			`);
		}
	});
});

function needsTaskId(argv: string[]): boolean {
	return (
		argv[0] !== "task-id" && !argv.some((arg) => ["--help", "-h", "--version", "-v"].includes(arg))
	);
}

function accepted(argv: string[]): boolean {
	return Boolean(intentOf(argv)) && isTaskId(taskIdOf(argv) ?? "");
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
