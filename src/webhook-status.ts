import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { stringify } from "./lib/json";
import { ForbiddenRequestError } from "./lib/request";
import { getWebhooks } from "./webhook-view";

const HELP = `
Usage: prismic webhook status <url> --repo <domain>

Show the enabled/disabled status of a webhook.

Arguments:
  <url>          Webhook URL

Options:
  -r, --repo     Repository domain (required)
  -h, --help     Show this help message
`.trim();

export async function webhookStatus(): Promise<void> {
	const {
		values: { help, repo },
		positionals: [webhookUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "status"
		options: {
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
		},
		allowPositionals: true,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!webhookUrl) {
		console.error("Missing required argument: <url>");
		process.exitCode = 1;
		return;
	}

	if (!repo) {
		console.error("Missing required option: --repo");
		process.exitCode = 1;
		return;
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		handleUnauthenticated();
		return;
	}

	const response = await getWebhooks(repo);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to get webhook status: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	const webhook = response.value.find((w) => w.config.url === webhookUrl);
	if (!webhook) {
		console.error(`Webhook not found: ${webhookUrl}`);
		process.exitCode = 1;
		return;
	}

	const status = webhook.config.active ? "enabled" : "disabled";
	console.info(status);
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
