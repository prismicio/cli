import { parseArgs } from "node:util";

import { previewAdd } from "./preview-add";
import { previewList } from "./preview-list";
import { previewRemove } from "./preview-remove";
import { previewSetName } from "./preview-set-name";

const HELP = `
Usage: prismic preview <subcommand> [options]

Manage preview configurations in a Prismic repository.

Subcommands:
  add           Add a preview configuration
  list          List preview configurations
  remove        Remove a preview configuration
  set-name      Update a preview's name

Options:
  -h, --help    Show this help message

Run 'prismic preview <subcommand> --help' for more information.
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
