import { parseArgs } from "node:util";

import { webhookAddHeader } from "./webhook-add-header";
import { webhookCreate } from "./webhook-create";
import { webhookDisable } from "./webhook-disable";
import { webhookEnable } from "./webhook-enable";
import { webhookList } from "./webhook-list";
import { webhookRemove } from "./webhook-remove";
import { webhookRemoveHeader } from "./webhook-remove-header";
import { webhookSetTriggers } from "./webhook-set-triggers";
import { webhookStatus } from "./webhook-status";
import { webhookTest } from "./webhook-test";
import { webhookView } from "./webhook-view";

const HELP = `
Usage: prismic webhook <subcommand> [options]

Manage webhooks in a Prismic repository.

Subcommands:
  list           List all webhooks
  create         Create a new webhook
  view           View webhook details
  remove         Delete a webhook
  test           Trigger a test webhook
  enable         Enable a webhook
  disable        Disable a webhook
  status         Show webhook enabled/disabled status
  add-header     Add a custom HTTP header
  remove-header  Remove a custom HTTP header
  set-triggers   Update webhook triggers

Options:
  -h, --help     Show this help message

Run 'prismic webhook <subcommand> --help' for more information.
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
		case "test":
			await webhookTest();
			break;
		case "enable":
			await webhookEnable();
			break;
		case "disable":
			await webhookDisable();
			break;
		case "status":
			await webhookStatus();
			break;
		case "add-header":
			await webhookAddHeader();
			break;
		case "remove-header":
			await webhookRemoveHeader();
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
