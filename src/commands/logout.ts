import { endSession } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { recordLogout } from "../tracking";

const config = {
	name: "prismic logout",
	description: "Log out of Prismic.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const { revoked, warnings } = await endSession();
	recordLogout({ revoked });
	for (const warning of warnings) console.warn(warning);
	console.info("Logged out of Prismic");
});
