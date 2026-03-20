import { getHost, getToken } from "../auth";
import { getWebhooks, updateWebhook } from "../clients/wroom";
import { CommandError, parseCommand } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

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
		values: { repo = await getRepositoryName() },
		positionals: [webhookUrl],
	} = parseCommand({
		help: HELP,
		argv: process.argv.slice(4),
		options: {
			repo: { type: "string", short: "r" },
		},
		allowPositionals: true,
	});

	if (!webhookUrl) {
		throw new CommandError("Missing required argument: <url>");
	}

	const token = await getToken();
	const host = await getHost();
	const webhooks = await getWebhooks({ repo, token, host });
	const webhook = webhooks.find((w) => w.config.url === webhookUrl);
	if (!webhook) {
		throw new CommandError(`Webhook not found: ${webhookUrl}`);
	}

	if (!webhook.config.active) {
		console.info(`Webhook already disabled: ${webhookUrl}`);
		return;
	}

	const id = webhook.config._id;

	const updatedConfig = structuredClone(webhook.config);
	updatedConfig.active = false;

	try {
		await updateWebhook(id, updatedConfig, { repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to disable webhook: ${message}`);
		}
		throw error;
	}

	console.info(`Webhook disabled: ${webhookUrl}`);
}
