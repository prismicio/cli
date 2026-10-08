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

	if (session.type === "Machine2Machine") {
		console.info(`${session.appName} (Write API token for ${session.domain})`);
		return;
	}
	console.info(session.email);
});
