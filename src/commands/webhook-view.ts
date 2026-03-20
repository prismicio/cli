import { getHost, getToken } from "../auth";
import { getWebhooks, WEBHOOK_TRIGGERS } from "../clients/wroom";
import { CommandError, parseCommand } from "../lib/command";
import { getRepositoryName } from "../project";

const HELP = `
View details of a webhook in a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic webhook view <url> [flags]

ARGUMENTS
  <url>   Webhook URL

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function webhookView(): Promise<void> {
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

	const webhook = webhooks.find((webhook) => webhook.config.url === webhookUrl);
	if (!webhook) {
		throw new CommandError(`Webhook not found: ${webhookUrl}`);
	}

	const { config } = webhook;

	console.info(`URL:     ${config.url}`);
	console.info(`Name:    ${config.name || "(none)"}`);
	console.info(`Status:  ${config.active ? "enabled" : "disabled"}`);
	console.info(`Secret:  ${config.secret ? "(set)" : "(none)"}`);

	// Show triggers
	const enabledTriggers: string[] = [];
	for (const trigger of WEBHOOK_TRIGGERS) {
		if (config[trigger as keyof typeof config]) {
			enabledTriggers.push(trigger);
		}
	}
	console.info(`Triggers: ${enabledTriggers.length > 0 ? enabledTriggers.join(", ") : "(none)"}`);

	// Show headers
	const headerKeys = Object.keys(config.headers);
	if (headerKeys.length > 0) {
		console.info("Headers:");
		for (const [key, value] of Object.entries(config.headers)) {
			console.info(`  ${key}: ${value}`);
		}
	} else {
		console.info("Headers: (none)");
	}
}
