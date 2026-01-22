import { parseArgs } from "node:util";

import { codegenTypes } from "./codegen-types";

const HELP = `
Generate code from Prismic models.

USAGE
  prismic codegen <command> [flags]

COMMANDS
  types       Generate TypeScript types from models pushed to Prismic

FLAGS
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic codegen <command> --help\` for more information about a command.
`.trim();

export async function codegen(): Promise<void> {
	const {
		positionals: [subcommand],
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "codegen"
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: false,
	});

	switch (subcommand) {
		case "types":
			await codegenTypes();
			break;
		default: {
			if (subcommand) {
				console.error(`Unknown codegen subcommand: ${subcommand}\n`);
				process.exitCode = 1;
			}
			console.info(HELP);
		}
	}
}
