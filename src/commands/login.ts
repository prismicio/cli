import { exec } from "node:child_process";

import { createLoginSession } from "../auth";
import { parseCommand } from "../lib/command";

const HELP = `
Log in to Prismic via browser.

USAGE
  prismic login [flags]

FLAGS
      --no-browser   Skip opening the browser automatically
  -h, --help         Show help for command

LEARN MORE
  Use \`prismic <command> --help\` for more information about a command.
`.trim();

export async function login(): Promise<void> {
	const {
		values: { "no-browser": noBrowser },
	} = parseCommand({
		help: HELP,
		argv: process.argv.slice(3),
		options: {
			"no-browser": { type: "boolean" },
		},
	});

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
}

function openBrowser(url: URL): void {
	const cmd =
		process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	exec(`${cmd} "${url.toString()}"`);
}
