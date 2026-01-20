import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError } from "./lib/request";
import { updateWebhook } from "./webhook-enable";
import { getWebhooks } from "./webhook-view";

const HELP = `
Disable a webhook in a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic webhook disable <url> [flags]

ARGUMENTS
  <url>   Webhook URL

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function webhookDisable(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig() },
		positionals: [webhookUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "disable"
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
			console.error(`Failed to disable webhook: ${stringify(webhooksResponse.value)}`);
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

	if (!webhook.config.active) {
		console.info(`Webhook already disabled: ${webhookUrl}`);
		return;
	}

	const updatedConfig = structuredClone(webhook.config);
	updatedConfig.active = false;

	const response = await updateWebhook(repo, webhook.config._id, updatedConfig);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to disable webhook: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(`Webhook disabled: ${webhookUrl}`);
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
