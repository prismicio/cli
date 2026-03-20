import { getHost, getToken } from "../auth";
import { getProfile } from "../clients/user";
import { createCommand, defineCommandConfig } from "../lib/command";

const config = defineCommandConfig({
	name: "whoami",
	description: "Show the currently logged in user.",
});

export default createCommand(config, async () => {
	const token = await getToken();
	const host = await getHost();
	const profile = await getProfile({ token, host });

	console.info(profile.email);
});
