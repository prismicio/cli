import { getHost, getToken } from "../auth";
import { getProfile } from "../clients/user";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic whoami",
	description: "Show the currently logged in user.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const token = await getToken();
	const host = await getHost();
	const profile = await getProfile({ token, host });

	console.info(profile.email);
});
