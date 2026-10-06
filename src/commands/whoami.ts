import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { getProfile } from "../lib/prismic/clients/user";
import { readWriteApiToken } from "../lib/prismic/write-api-token";

const config = {
	name: "prismic whoami",
	description: "Show the currently logged in user.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const { token, host } = await getCredentials();
	// A Write API token has no user. GET /profile returns 403, so read the
	// repository and app name from the JWT instead of calling it.
	const writeToken = readWriteApiToken(token);
	if (writeToken) {
		console.info("Write API token");
		console.info(`Repository: ${writeToken.domain}`);
		console.info(`App: ${writeToken.appName}`);
		return;
	}

	const profile = await getProfile({ token, host });
	console.info(profile.email);
});
