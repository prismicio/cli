import { parseArgs } from "node:util";

import { repoCreate } from "./repo-create";
import { repoList } from "./repo-list";
import { repoSetName } from "./repo-set-name";
import { repoView } from "./repo-view";

const HELP = `
Usage: prismic repo <subcommand> [options]

Manage Prismic repositories.

Subcommands:
  create        Create a new Prismic repository
  list          List all repositories
  view          View repository details
  set-name      Set repository display name

Options:
  -h, --help    Show this help message

Run 'prismic repo <subcommand> --help' for more information.
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
