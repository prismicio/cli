import { parseArgs } from "node:util";

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

export async function webhook(): Promise<void> {
	const {
		positionals: [subcommand],
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "webhook"
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: false,
	});

	switch (subcommand) {
		case "list":
			await webhookList();
			break;
		case "create":
			await webhookCreate();
			break;
		case "view":
			await webhookView();
			break;
		case "remove":
			await webhookRemove();
			break;
		case "enable":
			await webhookEnable();
			break;
		case "disable":
			await webhookDisable();
			break;
		case "set-triggers":
			await webhookSetTriggers();
			break;
		default: {
			if (subcommand) {
				console.error(`Unknown webhook subcommand: ${subcommand}\n`);
				process.exitCode = 1;
			}
			console.info(HELP);
		}
	}
}
