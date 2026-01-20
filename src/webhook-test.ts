import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";
import { getWebhooks } from "./webhook-view";

const HELP = `
Usage: prismic webhook test <url> --repo <domain>

Trigger a test webhook in a Prismic repository.

Arguments:
  <url>          Webhook URL

Options:
  -r, --repo     Repository domain (required)
  -h, --help     Show this help message
`.trim();

export async function webhookTest(): Promise<void> {
	const {
		values: { help, repo },
		positionals: [webhookUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "test"
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

	const webhooksResponse = await getWebhooks(repo);
	if (!webhooksResponse.ok) {
		if (webhooksResponse.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to test webhook: ${stringify(webhooksResponse.value)}`);
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

	const response = await triggerWebhook(repo, webhook.config._id);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to test webhook: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(`Test webhook triggered: ${webhookUrl}`);
}

async function triggerWebhook(repo: string, webhookId: string) {
	const url = new URL(`/app/settings/webhooks/${webhookId}/trigger`, await getRepoUrl(repo));
	return await request(url, { method: "POST" });
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
