import dedent from "dedent";
import { rm } from "node:fs/promises";
import { describe } from "vitest";

import { it, trials } from "./it";

describe.for([
	"claude-fable-5-1",
	"claude-opus-5",
	"claude-sonnet-5",
	"gpt-5.6-sol",
	"gpt-5.6-terra",
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
