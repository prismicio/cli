import { parseArgs } from "node:util";

import { localeAdd } from "./locale-add";
import { localeList } from "./locale-list";
import { localeRemove } from "./locale-remove";
import { localeSetDefault } from "./locale-set-default";

const HELP = `
Usage: prismic locale <subcommand> [options]

Manage locales in a Prismic repository.

Subcommands:
  add           Add a locale to a repository
  list          List locales in a repository
  remove        Remove a locale from a repository
  set-default   Set the default locale for a repository

Options:
  -h, --help    Show this help message

Run 'prismic locale <subcommand> --help' for more information.
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
