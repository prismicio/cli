import { hasGuestEnded, logIn } from "../auth";
import { readLoginSummary } from "../credentials";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic login",
	description: "Log in to Prismic. Prints a URL and a code to approve in a browser.",
	options: {
		"no-browser": { type: "boolean", description: "Skip opening the browser automatically" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	// Logging in replaces the temporary account, which strands its repositories.
	const { guest } = await readLoginSummary();
	if (guest && !(await hasGuestEnded())) {
		throw new CommandError(
			`You're logged in to a temporary account. Claim it first (${guest.claimUrl}), or run \`prismic logout\` to abandon it.`,
		);
	}
	await logIn({ browser: !values["no-browser"] });
});
