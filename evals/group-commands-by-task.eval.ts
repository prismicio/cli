import type { ExpectStatic } from "vitest";

import dedent from "dedent";
import { describe } from "vitest";

import { buildCustomType, writeLocalCustomType } from "../test/it";
import { it, trials } from "./it";

type Agent = (prompt: string) => Promise<{ calls: string[][]; text: string }>;

const TASK_ID = /^pt_[0-9a-hjkmnp-tv-z]{16}$/;

// `task-id` mints the id and `--version` exits before the gate, so neither carries one.
const gated = (argv: string[]) =>
	argv[0] !== "task-id" && !argv.some((arg) => ["--help", "-h", "--version", "-v"].includes(arg));

// A call the CLI refuses records nothing, and it refuses one missing either option.
const recorded = (argv: string[]) => Boolean(intentOf(argv)) && TASK_ID.test(taskIdOf(argv) ?? "");

// Both spellings reach the CLI, so read whichever the agent used.
const taskIdOf = (argv: string[]) =>
	optionValue(argv, "task-id") ?? optionValue(argv, "analytics-task-id");
const intentOf = (argv: string[]) =>
	optionValue(argv, "user-intent") ?? optionValue(argv, "analytics-intent");

const CTA = `Using the Prismic CLI, create a "call to action" slice with a heading, body text, and a button label, then add it to the "article" type.`;
const DATE_FIELD = `Using the Prismic CLI, add a "published_at" date field to the "article" type.`;

// The intent labels the group, it does not key it, so rewording between commands is harmless.
// An intent describing one command instead of the request is not, so judge rather than compare.
const expectIntentsDescribe = async (
	expect: ExpectStatic,
	calls: string[][],
	request: string,
	seen: string,
) => {
	const intents = [...new Set(calls.map(intentOf).filter(Boolean))];
	expect(intents.length, seen).toBeGreaterThan(0);
	for (const intent of intents) {
		await expect(intent).toSatisfyJudge(dedent`
			The user asked an agent: ${request}
			Above is the value the agent passed as the intent to the Prismic CLI.
			Passes if it paraphrases that request in one short sentence.
			Fails if it is empty, is a placeholder, describes a single CLI command rather than the
			whole request, or describes a different request.
		`);
	}
};

// One id spanning both requests is what would corrupt the analytics.
const eachRequestGetsItsOwnId = async (
	_: unknown,
	{ project, agent, expect }: { project: URL; agent: Agent; expect: ExpectStatic },
) => {
	await writeLocalCustomType(project, buildCustomType({ id: "article", label: "Article" }));

	const firstResult = await agent(CTA);
	const firstCount = firstResult.calls.length;
	const secondResult = await agent(DATE_FIELD);

	const firstCalls = firstResult.calls.filter(gated);
	const secondCalls = secondResult.calls.slice(firstCount).filter(gated);
	const summarise = (label: string, calls: string[][]) => [
		label,
		...calls.map(
			(argv) =>
				`  ${argv.find((arg) => !arg.startsWith("--")) ?? "?"} -> id=${taskIdOf(argv) ?? "none"} intent=${JSON.stringify(intentOf(argv) ?? null)}`,
		),
	];
	const seen = [
		...summarise("request 1:", firstCalls),
		...summarise("request 2:", secondCalls),
	].join("\n");

	// `seen` above lists every gated call, refusals included, so a failure still shows them.
	const firstRecorded = firstCalls.filter(recorded);
	const secondRecorded = secondCalls.filter(recorded);
	const firstIds = [...new Set(firstRecorded.map(taskIdOf))];
	const secondIds = [...new Set(secondRecorded.map(taskIdOf))];

	expect(firstIds, seen).toHaveLength(1);
	expect(secondIds, seen).toHaveLength(1);

	expect(secondIds[0], seen).not.toBe(firstIds[0]);

	await expectIntentsDescribe(expect, firstRecorded, CTA, seen);
	await expectIntentsDescribe(expect, secondRecorded, DATE_FIELD, seen);
};

it.for(trials)("gives each request its own task id", eachRequestGetsItsOwnId);

// The same guarantee for an agent with no skill installed: the CLI has to carry it alone.
describe("without the skill", () => {
	it.scoped({ installSkill: false });

	it.for(trials)("gives each request its own task id", eachRequestGetsItsOwnId);
});

function optionValue(argv: string[], name: string): string | undefined {
	const index = argv.indexOf(`--${name}`);
	if (index !== -1) return argv[index + 1];
	return argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}
