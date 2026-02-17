import { parseArgs } from "node:util";

import { skillInstall } from "./skill-install";

const HELP = `
Install Prismic skills into supported AI tool directories.

USAGE
  prismic skill <command> [flags]

COMMANDS
  install    Install the Prismic skill into detected global skill directories

FLAGS
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic skill <command> --help\` for more information about a command.
`.trim();

export async function skill(): Promise<void> {
	const {
		positionals: [subcommand],
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "skill"
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: false,
	});

	switch (subcommand) {
		case "install":
			await skillInstall();
			break;
		default: {
			if (subcommand) {
				console.error(`Unknown skill subcommand: ${subcommand}\n`);
				process.exitCode = 1;
			}
			console.info(HELP);
		}
	}
}
