import { parseArgs } from "node:util";

import { logout as baseLogout } from "./lib/auth";

const HELP = `
Log out of Prismic.

USAGE
  prismic logout [flags]

FLAGS
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic <command> --help\` for more information about a command.
`.trim();

export async function logout(): Promise<void> {
	const { values } = parseArgs({
		args: process.argv.slice(3),
		options: { help: { type: "boolean", short: "h" } },
	});

	if (values.help) {
		console.info(HELP);
		return;
	}

	const ok = await baseLogout();
	if (ok) {
		console.info("Logged out of Prismic");
	} else {
		console.error("Logout failed. You can log out manually by deleting the file.");
		process.exitCode = 1;
	}
}
