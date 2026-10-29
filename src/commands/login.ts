import { logIn } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic login",
	description: "Log in to Prismic via browser.",
	options: {
		"no-browser": { type: "boolean", description: "Skip opening the browser automatically" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	await logIn({ openBrowser: !values["no-browser"] });
});
