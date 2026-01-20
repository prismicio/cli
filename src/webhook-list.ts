import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { stringify } from "./lib/json";
import { ForbiddenRequestError } from "./lib/request";
import { getWebhooks } from "./webhook-view";

const HELP = `
Usage: prismic webhook list --repo <domain>

List all webhooks in a Prismic repository.

Options:
  -r, --repo   Repository domain (required)
      --json   Output as JSON
  -h, --help   Show this help message
`.trim();

export async function webhookList(): Promise<void> {
	const {
		values: { help, repo, json },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "list"
		options: {
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
			json: { type: "boolean" },
		},
		allowPositionals: false,
	});

	if (help) {
		console.info(HELP);
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
		} else if (v.isValiError(response.error)) {
			console.error(
				`Failed to list webhooks: Invalid response: ${stringify(response.error.issues)}`,
			);
			process.exitCode = 1;
		} else {
			console.error(`Failed to list webhooks: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	const webhooks = response.value;
	if (json) {
		console.info(stringify(webhooks.map((w) => w.config)));
	} else {
		if (webhooks.length === 0) {
			console.info("No webhooks configured.");
			return;
		}
		for (const webhook of webhooks) {
			const status = webhook.config.active ? "enabled" : "disabled";
			const name = webhook.config.name ? ` (${webhook.config.name})` : "";
			console.info(`${webhook.config.url}${name}  [${status}]`);
		}
	}
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
