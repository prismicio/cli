import { parseArgs } from "node:util";

import { sliceAddField } from "./slice-add-field";
import { sliceCreate } from "./slice-create";

const HELP = `
Manage slices in a Prismic project.

USAGE
  prismic slice <command> [flags]

COMMANDS
  create      Create a new slice
  add-field   Add a field to a slice

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
		case "add-field":
			await sliceAddField();
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
