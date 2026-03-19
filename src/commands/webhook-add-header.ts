import { parseArgs } from "node:util";

import { getWebhooks, updateWebhook } from "../clients/wroom";
import { getHost, getToken } from "../auth";
import { safeGetRepositoryName } from "../project";
import { UnknownRequestError } from "../lib/request";

const HELP = `
Add a custom HTTP header to a webhook.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic webhook add-header <url> <key> <value> [flags]

ARGUMENTS
  <url>     Webhook URL
  <key>     Header name
  <value>   Header value

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function webhookAddHeader(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryName() },
		positionals: [webhookUrl, headerKey, headerValue],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "add-header"
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

	if (!headerValue) {
		console.error("Missing required argument: <value>");
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

	const id = webhook.config._id;

	const updatedConfig = structuredClone(webhook.config);
	updatedConfig.headers[headerKey] = headerValue;

	try {
		await updateWebhook(id, updatedConfig, { repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			console.error(`Failed to add header: ${message}`);
			process.exitCode = 1;
			return;
		}
		throw error;
	}

	console.info(`Header added: ${headerKey}`);
}
