import { getHost, getToken } from "../auth";
import { getProfile } from "../clients/user";
import { parseCommand } from "../lib/command";

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
	parseCommand({
		help: HELP,
		argv: process.argv.slice(3),
	});

	const token = await getToken();
	const host = await getHost();
	const profile = await getProfile({ token, host });

	console.info(profile.email);
}
