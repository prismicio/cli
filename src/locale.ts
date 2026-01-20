import { parseArgs } from "node:util";

import { localeAdd } from "./locale-add";
import { localeList } from "./locale-list";
import { localeRemove } from "./locale-remove";
import { localeSetDefault } from "./locale-set-default";

const HELP = `
Manage locales in a Prismic repository.

USAGE
  prismic locale <command> [flags]

COMMANDS
  add           Add a locale to a repository
  list          List locales in a repository
  remove        Remove a locale from a repository
  set-default   Set the default locale for a repository

FLAGS
  -h, --help    Show help for command

LEARN MORE
  Use \`prismic locale <command> --help\` for more information about a command.
`.trim();

export async function locale(): Promise<void> {
	const {
		positionals: [subcommand],
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "locale"
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: false,
	});

	switch (subcommand) {
		case "add":
			await localeAdd();
			break;
		case "list":
			await localeList();
			break;
		case "remove":
			await localeRemove();
			break;
		case "set-default":
			await localeSetDefault();
			break;
		default: {
			if (subcommand) {
				console.error(`Unknown locale subcommand: ${subcommand}\n`);
				process.exitCode = 1;
			}
			console.info(HELP);
		}
	}
}
