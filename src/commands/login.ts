import { exec } from "node:child_process";
import { parseArgs } from "node:util";

import { createLoginSession } from "../auth";

const HELP = `
Log in to Prismic via browser.

USAGE
  prismic login [flags]

FLAGS
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic <command> --help\` for more information about a command.
`.trim();

export async function login(): Promise<void> {
	const { values } = parseArgs({
		args: process.argv.slice(3),
		options: { help: { type: "boolean", short: "h" } },
	});

	if (values.help) {
		console.info(HELP);
		return;
	}

	const { email } = await createLoginSession({
		onReady: (url) => {
			console.info("Opening browser to complete login...");
			console.info(`If the browser doesn't open, visit: ${url}`);
			openBrowser(url);
		},
	});

	console.info(`Logged in to Prismic as ${email}`);
}

function openBrowser(url: URL): void {
	const cmd =
		process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	exec(`${cmd} "${url.toString()}"`);
}
