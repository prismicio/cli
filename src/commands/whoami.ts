import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { getProfile } from "../lib/prismic/clients/user";
import { ignoreInvalidAuthContext } from "../lib/prismic/errors";

const config = {
	name: "prismic whoami",
	description: "Show the currently logged in user.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const { token, host } = await getCredentials();
	const profile = await getProfile({ token, host }).catch(ignoreInvalidAuthContext);

	console.info(profile?.email ?? "Write API token");
});
