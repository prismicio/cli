import { logout } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic logout",
	description: "Log out of Prismic.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	if (!(await logout())) {
		throw new CommandError("Logout failed. You can log out manually by deleting the file.");
	}
	console.info("Logged out of Prismic");
});
