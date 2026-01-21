import { parseArgs } from "node:util";

import { pageTypeAddField } from "./page-type-add-field";
import { pageTypeConnectSlice } from "./page-type-connect-slice";
import { pageTypeCreate } from "./page-type-create";
import { pageTypeDisconnectSlice } from "./page-type-disconnect-slice";
import { pageTypeList } from "./page-type-list";
import { pageTypeRemove } from "./page-type-remove";
import { pageTypeRemoveField } from "./page-type-remove-field";
import { pageTypeSetName } from "./page-type-set-name";
import { pageTypeSetRepeatable } from "./page-type-set-repeatable";
import { pageTypeView } from "./page-type-view";

const HELP = `
Manage page types in a Prismic repository.

USAGE
  prismic page-type <command> [flags]

COMMANDS
  create            Create a new page type
  list              List all page types
  view              View details of a page type
  remove            Remove a page type
  set-name          Change a page type's display name
  set-repeatable    Set whether a page type is repeatable
  add-field         Add a field to a page type
  remove-field      Remove a field from a page type
  connect-slice     Connect a shared slice to a page type
  disconnect-slice  Disconnect a shared slice from a page type

FLAGS
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic page-type <command> --help\` for more information about a command.
`.trim();

export async function pageType(): Promise<void> {
	const {
		positionals: [subcommand],
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "page-type"
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: false,
	});

	switch (subcommand) {
		case "create":
			await pageTypeCreate();
			break;
		case "list":
			await pageTypeList();
			break;
		case "view":
			await pageTypeView();
			break;
		case "remove":
			await pageTypeRemove();
			break;
		case "set-name":
			await pageTypeSetName();
			break;
		case "set-repeatable":
			await pageTypeSetRepeatable();
			break;
		case "add-field":
			await pageTypeAddField();
			break;
		case "remove-field":
			await pageTypeRemoveField();
			break;
		case "connect-slice":
			await pageTypeConnectSlice();
			break;
		case "disconnect-slice":
			await pageTypeDisconnectSlice();
			break;
		default: {
			if (subcommand) {
				console.error(`Unknown page-type subcommand: ${subcommand}\n`);
				process.exitCode = 1;
			}
			console.info(HELP);
		}
	}
}
