import { defineRouter } from "../lib/command";

import { webhookCreate } from "./webhook-create";
import { webhookDisable } from "./webhook-disable";
import { webhookEnable } from "./webhook-enable";
import { webhookList } from "./webhook-list";
import { webhookRemove } from "./webhook-remove";
import { webhookSetTriggers } from "./webhook-set-triggers";
import { webhookView } from "./webhook-view";

const HELP = `
Manage webhooks in a Prismic repository.

USAGE
  prismic webhook <command> [flags]

COMMANDS
  list           List all webhooks
  create         Create a new webhook
  view           View webhook details
  remove         Delete a webhook
  enable         Enable a webhook
  disable        Disable a webhook
  set-triggers   Update webhook triggers

FLAGS
  -h, --help     Show help for command

LEARN MORE
  Use \`prismic webhook <command> --help\` for more information about a command.
`.trim();

export const webhook = defineRouter({
	help: HELP,
	argv: process.argv.slice(3),
	commands: {
		list: webhookList,
		create: webhookCreate,
		view: webhookView,
		remove: webhookRemove,
		enable: webhookEnable,
		disable: webhookDisable,
		"set-triggers": webhookSetTriggers,
	},
});
