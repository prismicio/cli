import { parseArgs } from "node:util";

import { tokenCreate } from "./token-create";
import { tokenDelete } from "./token-delete";
import { tokenList } from "./token-list";
import { tokenSetName } from "./token-set-name";

const HELP = `
Manage API tokens for a Prismic repository.

USAGE
  prismic token <command> [flags]

COMMANDS
  list        List all tokens
  create      Create a new token
  set-name    Set token name (access tokens only)
  delete      Delete a token

FLAGS
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic token <command> --help\` for more information about a command.
`.trim();

export async function token(): Promise<void> {
	const {
		positionals: [subcommand],
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "token"
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: false,
	});

	switch (subcommand) {
		case "list":
			await tokenList();
			break;
		case "create":
			await tokenCreate();
			break;
		case "set-name":
			await tokenSetName();
			break;
		case "delete":
			await tokenDelete();
			break;
		default: {
			if (subcommand) {
				console.error(`Unknown token subcommand: ${subcommand}\n`);
				process.exitCode = 1;
			}
			console.info(HELP);
		}
	}
}
