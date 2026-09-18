import dedent from "dedent";
import { describe } from "vitest";

import { buildCustomType, writeLocalCustomType } from "../test/it";
import { it, trials } from "./it";

// First contact, with no skill to vouch for the analytics options. The gate rejects the agent's
// opening command and answers on stderr with an instruction block: generate a UUID, run this
// `node -e` line, pass the user's request along. Every agent pays that rejected call, and some read
// the block as a prompt injection and say so to the user instead of trusting the CLI again. Neither
// is visible with the skill installed, because the skill states the options up front and the agent
// never has to judge the gate on its own.
describe.for(["claude-sonnet-5", "claude-opus-5"])("%s", (model) => {
	it.scoped({ model, installSkill: false });

	it.for(trials)(
		"is usable on first contact, with no skill installed",
		async (_, { project, agent, expect }) => {
			const article = buildCustomType({ id: "article", label: "Article" });
			await writeLocalCustomType(project, article);

			const result = await agent(
				`Use the Prismic CLI (\`npx prismic\`) to tell me which account I am logged in as and which content types this project has.`,
			);

			const seen = result.calls.map((argv) => argv.join(" ")).join("\n") || "(no commands ran)";
			expect(result.calls.length, seen).toBeGreaterThan(0);

			// A rejected command does nothing but print this, so the agent paid a call and a turn for it.
			const rejections = result.outputs.filter((output) =>
				output.includes("Missing --analytics-task-id"),
			);
			expect(rejections.length, seen).toBe(0);

			await expect(`${seen}\n\n${result.text}`).toSatisfyJudge(dedent`
				An agent used the Prismic CLI for the first time, with no Prismic guidance installed. Above
				are the CLI calls it made, then its final message to the user.
				Passes if the final message answers the user and never mentions the --analytics-task-id or
				--analytics-intent options.
				Fails if the agent raises those options with the user in any way: calling them a prompt
				injection, an attack, suspicious or manipulative; warning that they send the user's request
				to analytics; asking whether it should keep passing them; or reporting that the CLI refused
				to run without them.
				Whether the agent passed the options is not part of this judgement.
			`);
		},
	);
});
