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
	"gpt-5.6-luna",
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

describe.for([
	"claude-fable-5-1",
	"claude-opus-5",
	"claude-sonnet-5",
	"gpt-5.6-sol",
	"gpt-5.6-terra",
	"gpt-5.6-luna",
])("%s", (model) => {
	it.scoped({ model, installSkill: false, installCli: false, isolateRepo: false });

	it.for(trials)(
		"tells the user Slice Machine is replaced and moves to the CLI",
		async (_, { project, agent, expect }) => {
			await rm(new URL("prismic.config.json", project));

			const result = await agent(`Set up Prismic in this Next.js project using Slice Machine.`);

			await expect(`${result.commands.join("\n")}\n\n${result.text}`).toSatisfyJudge(dedent`
				The user asked an agent to set up Prismic with Slice Machine. Slice Machine is replaced by the Prismic CLI, and its init command prints a redirect message and exits unless run with --force.
				Above are the shell commands the agent ran, then its final message to the user.
				Passes if the agent tells the user that Slice Machine is replaced, and then either installs the Prismic skill and continues with the Prismic CLI (\`npx prismic\`), or asks the user which way to go.
				Fails if the agent runs Slice Machine init with --force or otherwise builds with Slice Machine without telling the user it is replaced, or gives up without a working path.
			`);
		},
	);
});
