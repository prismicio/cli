import { getHost, getToken } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { validateToken } from "../lib/prismic/client";

const config = {
	name: "prismic whoami",
	description: "Show the currently logged in user.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const host = await getHost();
	const session = await validateToken(await getToken(), { host });

	if (session.type === "Machine2Machine") {
		console.info(`${session.appName} (Write API token for ${session.domain})`);
		return;
	}
	console.info(session.email);
});
