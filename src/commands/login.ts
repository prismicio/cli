import { logIn } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic login",
	description: "Log in to Prismic. Prints a URL and a code to approve in a browser.",
	options: {
		"no-browser": { type: "boolean", description: "Skip opening the browser automatically" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	await logIn({ browser: !values["no-browser"] });
});
