import { parseArgs } from "node:util";

import { getWebhooks, updateWebhook } from "../clients/wroom";
import { getHost, getToken } from "../auth";
import { safeGetRepositoryName } from "../project";
import { UnknownRequestError } from "../lib/request";

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
		values: { help, repo = await safeGetRepositoryName() },
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

	const token = await getToken();
	const host = await getHost();
	const webhooks = await getWebhooks({ repo, token, host });
	const webhook = webhooks.find((w) => w.config.url === webhookUrl);
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

	const id = webhook.config._id;

	const updatedConfig = structuredClone(webhook.config);
	delete updatedConfig.headers[headerKey];

	try {
		await updateWebhook(id, updatedConfig, { repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			console.error(`Failed to remove header: ${message}`);
			process.exitCode = 1;
			return;
		}
		throw error;
	}

	console.info(`Header removed: ${headerKey}`);
}
