import { parseArgs } from "node:util";

import { previewAdd } from "./preview-add";
import { previewGetSimulator } from "./preview-get-simulator";
import { previewList } from "./preview-list";
import { previewRemove } from "./preview-remove";
import { previewRemoveSimulator } from "./preview-remove-simulator";
import { previewSetName } from "./preview-set-name";
import { previewSetSimulator } from "./preview-set-simulator";

const HELP = `
Manage preview configurations in a Prismic repository.

USAGE
  prismic preview <command> [flags]

COMMANDS
  add               Add a preview configuration
  list              List preview configurations
  remove            Remove a preview configuration
  set-name          Update a preview's name
  set-simulator     Set the slice simulator URL
  get-simulator     Show the slice simulator URL
  remove-simulator  Remove the slice simulator URL

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
		case "set-simulator":
			await previewSetSimulator();
			break;
		case "get-simulator":
			await previewGetSimulator();
			break;
		case "remove-simulator":
			await previewRemoveSimulator();
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
