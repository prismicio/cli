import { getHost, getToken } from "../auth";
import { deleteWebhook, getWebhooks } from "../clients/wroom";
import { CommandError, parseCommand } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

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

	const id = webhook.config._id;

	try {
		await deleteWebhook(id, { repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to remove webhook: ${message}`);
		}
		throw error;
	}

	console.info(`Webhook removed: ${webhookUrl}`);
}
