import { exec } from "node:child_process";

import { createLoginSession } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic login",
	description: "Log in to Prismic via browser.",
	options: {
		"no-browser": { type: "boolean", description: "Skip opening the browser automatically" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { "no-browser": noBrowser } = values;

	const { email } = await createLoginSession({
		onReady: (url) => {
			if (noBrowser) {
				console.info(`Open this URL to log in: ${url}`);
			} else {
				console.info("Opening browser to complete login...");
				console.info(`If the browser doesn't open, visit: ${url}`);
				openBrowser(url);
			}
		},
	});

	console.info(`Logged in to Prismic as ${email}`);
});

function openBrowser(url: URL): void {
	const cmd =
		process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	exec(`${cmd} "${url.toString()}"`);
}
