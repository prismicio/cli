import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { getProfile } from "../lib/prismic/clients/user";

const config = {
	name: "prismic whoami",
	description: "Show the currently logged in user.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const { token, host } = await getCredentials();
	const { email } = await getProfile({ token, host });
	console.info(email);
});
