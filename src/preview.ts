import { parseArgs } from "node:util";

import { previewAdd } from "./preview-add";
import { previewList } from "./preview-list";
import { previewRemove } from "./preview-remove";
import { previewSetName } from "./preview-set-name";

const HELP = `
Manage preview configurations in a Prismic repository.

USAGE
  prismic preview <command> [flags]

COMMANDS
  add         Add a preview configuration
  list        List preview configurations
  remove      Remove a preview configuration
  set-name    Update a preview's name

FLAGS
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic preview <command> --help\` for more information about a command.
`.trim();

export async function preview(): Promise<void> {
	const {
		positionals: [subcommand],
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "preview"
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: false,
	});

	switch (subcommand) {
		case "add":
			await previewAdd();
			break;
		case "list":
			await previewList();
			break;
		case "remove":
			await previewRemove();
			break;
		case "set-name":
			await previewSetName();
			break;
		default: {
			if (subcommand) {
				console.error(`Unknown preview subcommand: ${subcommand}\n`);
				process.exitCode = 1;
			}
			console.info(HELP);
		}
	}
}
