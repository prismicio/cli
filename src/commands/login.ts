import { logIn } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic login",
	description: `
		Log in to Prismic. Prints a URL and a code to approve in a browser.

		The command waits until the login is approved, declined, or the code expires.
	`,
	agents: `
		Run this command in the background and give the user the URL it prints. If
		the code expires, or the run is stopped before the user approves, run it
		again. Give the user the URL again if it changed.
	`,
	options: {
		"no-browser": { type: "boolean", description: "Skip opening the browser automatically" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	await logIn({ browser: !values["no-browser"] });
});
