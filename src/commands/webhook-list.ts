import { getHost, getToken } from "../auth";
import { getWebhooks } from "../clients/wroom";
import { parseCommand } from "../lib/command";
import { stringify } from "../lib/json";
import { getRepositoryName } from "../project";

const HELP = `
List all webhooks in a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic webhook list [flags]

FLAGS
      --json          Output as JSON
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function webhookList(): Promise<void> {
	const {
		values: { repo = await getRepositoryName(), json },
	} = parseCommand({
		help: HELP,
		argv: process.argv.slice(4),
		options: {
			json: { type: "boolean" },
			repo: { type: "string", short: "r" },
		},
	});

	const token = await getToken();
	const host = await getHost();
	const webhooks = await getWebhooks({ repo, token, host });

	if (json) {
		console.info(stringify(webhooks.map((webhook) => webhook.config)));
		return;
	}

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
