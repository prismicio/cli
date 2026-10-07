import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { validateToken } from "../lib/prismic/clients/auth";

const config = {
	name: "prismic whoami",
	description: "Show the currently logged in user.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const { token, host } = await getCredentials();
	const session = await validateToken(token, { host });

	if (session.type === "USER") {
		console.info(session.email);
		return;
	}
	console.info("Write API token");
	console.info(`Repository: ${session.domain}`);
	console.info(`App: ${session.appName}`);
});
