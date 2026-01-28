import { parseArgs } from "node:util";

import { sliceAddField } from "./slice-add-field";
import { sliceAddVariation } from "./slice-add-variation";
import { sliceCreate } from "./slice-create";
import { sliceList } from "./slice-list";
import { sliceListVariations } from "./slice-list-variations";
import { sliceRemove } from "./slice-remove";
import { sliceRemoveField } from "./slice-remove-field";
import { sliceRemoveVariation } from "./slice-remove-variation";
import { sliceRename } from "./slice-rename";
import { sliceSetScreenshot } from "./slice-set-screenshot";
import { sliceView } from "./slice-view";

const HELP = `
Manage slices in a Prismic project.

USAGE
  prismic slice <command> [flags]

COMMANDS
  create            Create a new slice
  list              List all slices
  view              View details of a slice
  rename            Rename a slice
  remove            Remove a slice
  add-field         Add a field to a slice
  remove-field      Remove a field from a slice
  add-variation     Add a variation to a slice
  remove-variation  Remove a variation from a slice
  list-variations   List all variations of a slice
  set-screenshot    Set a screenshot for a slice variation

FLAGS
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic slice <command> --help\` for more information about a command.
`.trim();

export async function slice(): Promise<void> {
	const {
		positionals: [subcommand],
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "slice"
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: false,
	});

	switch (subcommand) {
		case "create":
			await sliceCreate();
			break;
		case "list":
			await sliceList();
			break;
		case "view":
			await sliceView();
			break;
		case "rename":
			await sliceRename();
			break;
		case "remove":
			await sliceRemove();
			break;
		case "add-field":
			await sliceAddField();
			break;
		case "remove-field":
			await sliceRemoveField();
			break;
		case "add-variation":
			await sliceAddVariation();
			break;
		case "remove-variation":
			await sliceRemoveVariation();
			break;
		case "list-variations":
			await sliceListVariations();
			break;
		case "set-screenshot":
			await sliceSetScreenshot();
			break;
		default: {
			if (subcommand) {
				console.error(`Unknown slice subcommand: ${subcommand}\n`);
				process.exitCode = 1;
			}
			console.info(HELP);
		}
	}
}
