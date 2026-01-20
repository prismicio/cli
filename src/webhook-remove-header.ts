import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError } from "./lib/request";
import { updateWebhook } from "./webhook-enable";
import { getWebhooks } from "./webhook-view";

const HELP = `
Remove a custom HTTP header from a webhook.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic webhook remove-header <url> <key> [flags]

ARGUMENTS
  <url>   Webhook URL
  <key>   Header name

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function webhookRemoveHeader(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig() },
		positionals: [webhookUrl, headerKey],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "remove-header"
		options: {
			repo: { type: "string", short: "r" },
			help: { type: "boolean", short: "h" },
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

	if (!repo) {
		console.error("Missing prismic.config.json or --repo option");
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
			console.error(`Failed to remove header: ${stringify(webhooksResponse.value)}`);
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

	if (!(headerKey in webhook.config.headers)) {
		console.error(`Header not found: ${headerKey}`);
		process.exitCode = 1;
		return;
	}

	const updatedConfig = structuredClone(webhook.config);
	delete updatedConfig.headers[headerKey];

	const response = await updateWebhook(repo, webhook.config._id, updatedConfig);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to remove header: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(`Header removed: ${headerKey}`);
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
