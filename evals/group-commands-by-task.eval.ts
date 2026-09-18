import type { ExpectStatic } from "vitest";

import dedent from "dedent";
import { describe } from "vitest";

import { buildCustomType, writeLocalCustomType } from "../test/it";
import { it, trials } from "./it";

type Agent = (prompt: string) => Promise<{ calls: string[][]; text: string }>;

// An id the CLI minted, or a UUID from the skill's older recipe.
const TASK_ID =
	/^(pt_[0-9a-hjkmnp-tv-z]{16}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

// `task-id` mints the id and `--version` exits before the gate, so neither carries one.
const gated = (argv: string[]) =>
	argv[0] !== "task-id" &&
	!argv.includes("--help") &&
	!argv.includes("-h") &&
	!argv.includes("--version") &&
	!argv.includes("-v");

// The options were renamed; the published skill still teaches the old names.
const taskIdOf = (argv: string[]) =>
	optionValue(argv, "task-id") ?? optionValue(argv, "analytics-task-id");
const intentOf = (argv: string[]) =>
	optionValue(argv, "user-intent") ?? optionValue(argv, "analytics-intent");

const CTA = `Using the Prismic CLI, create a "call to action" slice with a heading, body text, and a button label, then add it to the "article" type.`;
const DATE_FIELD = `Using the Prismic CLI, add a "published_at" date field to the "article" type.`;

it.for(trials)(
	"passes one task ID and intent to every command",
	async (_, { project, agent, expect }) => {
		const article = buildCustomType({ id: "article", label: "Article" });
		await writeLocalCustomType(project, article);

		const request = `Add a "title" rich text field and a "published_at" date field to the "article" type.`;
		const result = await agent(request);

		const calls = result.calls.filter(gated);
		const seen = calls.map((argv) => argv.join(" ")).join("\n");
		expect(calls.length, seen).toBeGreaterThan(0);

		const taskIds = new Set(calls.map(taskIdOf).filter(Boolean));
		expect([...taskIds], seen).toHaveLength(1);
		expect([...taskIds][0], seen).toMatch(TASK_ID);

		const intents = new Set(calls.map(intentOf).filter(Boolean));
		expect([...intents], seen).toHaveLength(1);
		await expect([...intents][0]).toSatisfyJudge(dedent`
			The user asked an agent: ${request}
			Above is the value the agent passed as the intent to the Prismic CLI.
			Passes if it paraphrases the user's request in one short sentence.
			Fails if it is empty, describes a single CLI command rather than the whole request, or is not a sentence.
		`);
	},
);

// One id groups one user request. A second request is separate work and needs its own id, so the
// failure that costs the analytics most is not a missing id but one id spanning both requests.
// A command refused for having no id never ran, so it is a wasted call rather than a lost row and
// is not asserted here.
const eachRequestGetsItsOwnId = async (
	_: unknown,
	{ project, agent, expect }: { project: URL; agent: Agent; expect: ExpectStatic },
) => {
	const article = buildCustomType({ id: "article", label: "Article" });
	await writeLocalCustomType(project, article);

	const firstResult = await agent(CTA);
	const firstCount = firstResult.calls.length;
	const secondResult = await agent(DATE_FIELD);

	const firstCalls = firstResult.calls.slice(0, firstCount).filter(gated);
	const secondCalls = secondResult.calls.slice(firstCount).filter(gated);
	const summarise = (calls: string[][]) =>
		calls.map(
			(a) => `  ${a.filter((x) => !x.startsWith("--"))[0] ?? "?"} -> ${taskIdOf(a) ?? "none"}`,
		);
	const seen = [
		"request 1:",
		...summarise(firstCalls),
		"request 2:",
		...summarise(secondCalls),
	].join("\n");

	expect(firstCalls.length, seen).toBeGreaterThan(0);
	expect(secondCalls.length, seen).toBeGreaterThan(0);

	const firstIds = [...new Set(firstCalls.map(taskIdOf).filter(Boolean))];
	const secondIds = [...new Set(secondCalls.map(taskIdOf).filter(Boolean))];

	// One id per request, reused across every command of that request.
	expect(firstIds, seen).toHaveLength(1);
	expect(secondIds, seen).toHaveLength(1);
	expect(firstIds[0], seen).toMatch(TASK_ID);
	expect(secondIds[0], seen).toMatch(TASK_ID);

	// The second request gets its own id.
	expect(secondIds[0], seen).not.toBe(firstIds[0]);

	// The intent describes the request, so it does not change between its commands either.
	const secondIntents = [...new Set(secondCalls.map(intentOf).filter(Boolean))];
	expect([...new Set(firstCalls.map(intentOf).filter(Boolean))], seen).toHaveLength(1);
	expect(secondIntents, seen).toHaveLength(1);

	await expect(secondIntents[0]).toSatisfyJudge(dedent`
		The user asked an agent: ${"${DATE_FIELD}"}
		Above is the value the agent passed as the intent to the Prismic CLI.
		Passes if it paraphrases that request in one short sentence.
		Fails if it is empty, describes a single CLI command, or describes a different request such as
		creating a call to action slice.
	`);
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
