import { logout as baseLogout } from "../auth";
import { parseCommand } from "../lib/command";

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
	parseCommand({
		help: HELP,
		argv: process.argv.slice(3),
	});

	const ok = await baseLogout();
	if (ok) {
		console.info("Logged out of Prismic");
	} else {
		console.error("Logout failed. You can log out manually by deleting the file.");
		process.exitCode = 1;
	}
}
