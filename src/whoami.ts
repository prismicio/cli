import { parseArgs } from "node:util";

import { getProfile } from "./clients/user";
import { getHost, getToken } from "./lib/auth";

const HELP = `
Show the currently logged in user.

USAGE
  prismic whoami [flags]

FLAGS
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic <command> --help\` for more information about a command.
`.trim();

export async function whoami(): Promise<void> {
	const {
		values: { help },
	} = parseArgs({
		args: process.argv.slice(3),
		options: { help: { type: "boolean", short: "h" } },
	});

	if (help) {
		console.info(HELP);
		return;
	}

	const token = await getToken();
	const host = await getHost();
	const profile = await getProfile({ token, host });

	console.info(profile.email);
}
