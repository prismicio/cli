import { parseArgs } from "node:util";

import { repoCreate } from "./repo-create";
import { repoGetAccess } from "./repo-get-access";
import { repoList } from "./repo-list";
import { repoSetAccess } from "./repo-set-access";
import { repoSetName } from "./repo-set-name";
import { repoView } from "./repo-view";

const HELP = `
Manage Prismic repositories.

USAGE
  prismic repo <command> [flags]

COMMANDS
  create      Create a new Prismic repository
  list        List all repositories
  view        View repository details
  get-access  Get Content API access level
  set-access  Set Content API access level
  set-name    Set repository display name

FLAGS
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic repo <command> --help\` for more information about a command.
`.trim();

export async function repo(): Promise<void> {
	const {
		positionals: [subcommand],
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "repo"
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: false,
	});

	switch (subcommand) {
		case "create":
			await repoCreate();
			break;
		case "list":
			await repoList();
			break;
		case "view":
			await repoView();
			break;
		case "get-access":
			await repoGetAccess();
			break;
		case "set-access":
			await repoSetAccess();
			break;
		case "set-name":
			await repoSetName();
			break;
		default: {
			if (subcommand) {
				console.error(`Unknown repo subcommand: ${subcommand}\n`);
				process.exitCode = 1;
			}
			console.info(HELP);
		}
	}
}
