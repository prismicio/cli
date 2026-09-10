import dedent from "dedent";

import { buildCustomType, writeLocalCustomType } from "../test/it";
import { it, trials } from "./it";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

it.for(trials)(
	"passes one task ID and intent to every command",
	async (_, { project, agent, expect }) => {
		const article = buildCustomType({ id: "article", label: "Article" });
		await writeLocalCustomType(project, article);

		const request = `Add a "title" rich text field and a "published_at" date field to the "article" type.`;
		const result = await agent(request);

		const calls = result.calls.filter((argv) => !argv.includes("--help") && !argv.includes("-h"));
		const seen = calls.map((argv) => argv.join(" ")).join("\n");
		expect(calls.length, seen).toBeGreaterThan(0);

		const taskIds = new Set(calls.map((argv) => optionValue(argv, "analytics-task-id")));
		expect([...taskIds], seen).toHaveLength(1);
		expect([...taskIds][0], seen).toMatch(UUID);

		const intents = new Set(calls.map((argv) => optionValue(argv, "analytics-intent")));
		expect([...intents], seen).toHaveLength(1);
		await expect([...intents][0]).toSatisfyJudge(dedent`
			The user asked an agent: ${request}
			Above is the value the agent passed as --analytics-intent to the Prismic CLI.
			Passes if it paraphrases the user's request in one short sentence.
			Fails if it is empty, describes a single CLI command rather than the whole request, or is not a sentence.
		`);
	},
);

function optionValue(argv: string[], name: string): string | undefined {
	const index = argv.indexOf(`--${name}`);
	if (index !== -1) return argv[index + 1];
	return argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}
