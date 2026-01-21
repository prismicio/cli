import { parseArgs } from "node:util";

import { customTypeAddField } from "./custom-type-add-field";
import { customTypeConnectSlice } from "./custom-type-connect-slice";
import { customTypeCreate } from "./custom-type-create";
import { customTypeDisconnectSlice } from "./custom-type-disconnect-slice";

const HELP = `
Manage custom types in a Prismic repository.

USAGE
  prismic custom-type <command> [flags]

COMMANDS
  create            Create a new custom type
  add-field         Add a field to a custom type
  connect-slice     Connect a shared slice to a custom type
  disconnect-slice  Disconnect a shared slice from a custom type

FLAGS
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic custom-type <command> --help\` for more information about a command.
`.trim();

export async function customType(): Promise<void> {
	const {
		positionals: [subcommand],
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "custom-type"
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: false,
	});

	switch (subcommand) {
		case "create":
			await customTypeCreate();
			break;
		case "add-field":
			await customTypeAddField();
			break;
		case "connect-slice":
			await customTypeConnectSlice();
			break;
		case "disconnect-slice":
			await customTypeDisconnectSlice();
			break;
		default: {
			if (subcommand) {
				console.error(`Unknown custom-type subcommand: ${subcommand}\n`);
				process.exitCode = 1;
			}
			console.info(HELP);
		}
	}
}
