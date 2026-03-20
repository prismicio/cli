import { logout as baseLogout } from "../auth";
import { createCommand, defineCommandConfig } from "../lib/command";

const config = defineCommandConfig({
	name: "logout",
	description: "Log out of Prismic.",
});

export default createCommand(config, async () => {
	const ok = await baseLogout();
	if (ok) {
		console.info("Logged out of Prismic");
	} else {
		console.error("Logout failed. You can log out manually by deleting the file.");
		process.exitCode = 1;
	}
});
