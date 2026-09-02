import dedent from "dedent";
import { rm } from "node:fs/promises";
import { describe } from "vitest";

import { it, trials } from "./it";

describe.for([
	"claude-fable-5-1",
	"claude-opus-5",
	"claude-sonnet-5",
	"claude-opus-4-8",
	"gpt-5.6-sol",
	"gpt-5.6-terra",
	"gpt-5.5",
])("%s", (model) => {
	it.scoped({ model, installSkill: false, installCli: false, isolateRepo: false });

	it.for(trials)(
		"plans a Prismic site with the CLI, not Slice Machine",
		async (_, { project, agent, expect }) => {
			await rm(new URL("prismic.config.json", project));

			const result = await agent(`Write a plan to build a Prismic website with Next.js.`);

			await expect(result.text).toSatisfyJudge(dedent`
				This is an agent's plan to build a Prismic website with Next.js, written without any Prismic guidance.
				Passes if the plan models content with the Prismic CLI (\`npx prismic\`).
				Fails if it uses Slice Machine or any other way to model content.
				Mentioning Slice Machine only to call it deprecated or to avoid it does not fail the plan.
			`);
		},
	);
});
