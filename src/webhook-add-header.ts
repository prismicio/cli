import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { stringify } from "./lib/json";
import { ForbiddenRequestError } from "./lib/request";
import { updateWebhook } from "./webhook-enable";
import { getWebhooks } from "./webhook-view";

const HELP = `
Usage: prismic webhook add-header <url> <key> <value> --repo <domain>

Add a custom HTTP header to a webhook.

Arguments:
  <url>          Webhook URL
  <key>          Header name
  <value>        Header value

Options:
  -r, --repo     Repository domain (required)
  -h, --help     Show this help message
`.trim();

export async function webhookAddHeader(): Promise<void> {
	const {
		values: { help, repo },
		positionals: [webhookUrl, headerKey, headerValue],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "add-header"
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

	if (!headerKey) {
		console.error("Missing required argument: <key>");
		process.exitCode = 1;
		return;
	}

	if (!headerValue) {
		console.error("Missing required argument: <value>");
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

	const webhooksResponse = await getWebhooks(repo);
	if (!webhooksResponse.ok) {
		if (webhooksResponse.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to add header: ${stringify(webhooksResponse.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	const webhook = webhooksResponse.value.find((w) => w.config.url === webhookUrl);
	if (!webhook) {
		console.error(`Webhook not found: ${webhookUrl}`);
		process.exitCode = 1;
		return;
	}

	const updatedConfig = structuredClone(webhook.config);
	updatedConfig.headers[headerKey] = headerValue;

	const response = await updateWebhook(repo, webhook.config._id, updatedConfig);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to add header: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(`Header added: ${headerKey}`);
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
