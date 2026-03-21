import { logout as baseLogout } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic logout",
	description: "Log out of Prismic.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const ok = await baseLogout();
	if (ok) {
		console.info("Logged out of Prismic");
	} else {
		throw new CommandError("Logout failed. You can log out manually by deleting the file.");
	}
});
