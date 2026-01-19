import { parseArgs } from "node:util";

import { removeToken } from "./lib/auth";

const HELP = `
Usage: prismic logout

Log out of Prismic.

Options:
  -h, --help   Show this help message
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

	const ok = await removeToken();
	if (ok) {
		console.info("Logged out of Prismic");
	} else {
		console.error("Logout failed. You can log out manually by deleting the file.");
		process.exitCode = 1;
	}
}
