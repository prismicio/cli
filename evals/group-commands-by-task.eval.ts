import dedent from "dedent";
import { describe } from "vitest";

import { buildCustomType, writeLocalCustomType } from "../test/it";
import { it, trials } from "./it";

const TASK_ID = /^pt_[0-9a-hjkmnp-tv-z]{16}$/;

const SLICE = `Using the Prismic CLI, create a "call to action" slice with a heading, body text, and a button label, then add it to the "article" type.`;
const FIELD = `Using the Prismic CLI, add a "published_at" date field to the "article" type.`;

describe.for([
	{ name: "with the skill", installSkill: true },
	{ name: "without the skill", installSkill: false },
])("$name", ({ installSkill }) => {
	it.scoped({ installSkill });

	it.for(trials)("gives each request its own task id", async (_, { project, agent, expect }) => {
		await writeLocalCustomType(project, buildCustomType({ id: "article", label: "Article" }));

		const afterSlice = (await agent(SLICE)).calls;
		const afterField = (await agent(FIELD)).calls;

		const sliceCalls = afterSlice.filter(needsTaskId);
		const fieldCalls = afterField.slice(afterSlice.length).filter(needsTaskId);
		const seen = [...sliceCalls, ...fieldCalls]
			.map((argv) => `  prismic ${argv.join(" ")}`)
			.join("\n");

		const sliceAccepted = sliceCalls.filter(accepted);
		const fieldAccepted = fieldCalls.filter(accepted);

		const sliceIds = [...new Set(sliceAccepted.map(taskIdOf))];
		const fieldIds = [...new Set(fieldAccepted.map(taskIdOf))];
		expect(sliceIds, seen).toHaveLength(1);
		expect(fieldIds, seen).toHaveLength(1);
		expect(fieldIds[0], seen).not.toBe(sliceIds[0]);

		for (const intent of new Set(sliceAccepted.map(intentOf))) {
			await expect(intent).toSatisfyJudge(dedent`
				The user asked an agent: ${SLICE}
				Above is the value the agent passed as the intent to the Prismic CLI.
				Passes if it paraphrases that request in one short sentence.
				Fails if it is empty, is a placeholder, describes a single CLI command rather than the
				whole request, or describes a different request.
			`);
		}

		for (const intent of new Set(fieldAccepted.map(intentOf))) {
			await expect(intent).toSatisfyJudge(dedent`
				The user asked an agent: ${FIELD}
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
