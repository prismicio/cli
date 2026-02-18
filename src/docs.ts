import { parseArgs } from "node:util";
import { docsFetch } from "./docs-fetch";
import { docsList } from "./docs-list";

const HELP = `
Fetch and list documentation from Prismic's docs site.

USAGE
  prismic docs <command> [flags]

COMMANDS
  fetch      Fetch and display a documentation page
  list       List documentation pages

FLAGS
  -h, --help   Show help for command

EXAMPLES
  prismic docs fetch nextjs
  prismic docs fetch nextjs#set-up-a-prismic-client
  prismic docs list

LEARN MORE
  Use \`prismic docs <command> --help\` for more information about a command.
`.trim();

export async function docs(): Promise<void> {
	const {
		positionals: [subcommand],
	} = parseArgs({
		args: process.argv.slice(3),
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: false,
	});

	switch (subcommand) {
		case "fetch":
			await docsFetch();
			break;
		case "list":
			await docsList();
			break;
		default: {
			if (subcommand) {
				console.error(`Unknown docs subcommand: ${subcommand}\n`);
				process.exitCode = 1;
			}
			console.info(HELP);
		}
	}
}
