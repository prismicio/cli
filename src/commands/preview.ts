import { defineRouter } from "../lib/command";

import { previewAdd } from "./preview-add";
import { previewList } from "./preview-list";
import { previewRemove } from "./preview-remove";
import { previewSetSimulator } from "./preview-set-simulator";

const HELP = `
Manage preview configurations in a Prismic repository.

USAGE
  prismic preview <command> [flags]

COMMANDS
  add              Add a preview configuration
  list             List preview configurations
  remove           Remove a preview configuration
  set-simulator    Set the slice simulator URL

FLAGS
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic preview <command> --help\` for more information about a command.
`.trim();

export const preview = defineRouter({
	help: HELP,
	argv: process.argv.slice(3),
	commands: {
		add: previewAdd,
		list: previewList,
		remove: previewRemove,
		"set-simulator": previewSetSimulator,
	},
});
