import { parseArgs } from "node:util";

import { getWebhooks } from "../clients/wroom";
import { getHost, getToken } from "../auth";
import { safeGetRepositoryName } from "../project";

const HELP = `
Show the enabled/disabled status of a webhook.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic webhook status <url> [flags]

ARGUMENTS
  <url>   Webhook URL

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function webhookStatus(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryName() },
		positionals: [webhookUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "status"
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

	const status = webhook.config.active ? "enabled" : "disabled";
	console.info(status);
}
