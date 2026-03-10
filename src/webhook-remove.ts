import { parseArgs } from "node:util";

import { deleteWebhook, getWebhooks } from "./clients/wroom";
import { getHost, getToken } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { UnknownRequestError } from "./lib/request";

const HELP = `
Delete a webhook from a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic webhook remove <url> [flags]

ARGUMENTS
  <url>   Webhook URL

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function webhookRemove(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig() },
		positionals: [webhookUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "remove"
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

	try {
		await deleteWebhook(id, { repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			console.error(`Failed to remove webhook: ${message}`);
			process.exitCode = 1;
			return;
		}
		throw error;
	}

	console.info(`Webhook removed: ${webhookUrl}`);
}
