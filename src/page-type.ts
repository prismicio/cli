import { parseArgs } from "node:util";

import { pageTypeAddField } from "./page-type-add-field";
import { pageTypeConnectSlice } from "./page-type-connect-slice";
import { pageTypeCreate } from "./page-type-create";
import { pageTypeDisconnectSlice } from "./page-type-disconnect-slice";

const HELP = `
Manage page types in a Prismic repository.

USAGE
  prismic page-type <command> [flags]

COMMANDS
  create            Create a new page type
  add-field         Add a field to a page type
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
		case "add-field":
			await pageTypeAddField();
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
