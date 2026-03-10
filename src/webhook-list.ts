import { parseArgs } from "node:util";

import { getWebhooks } from "./clients/wroom";
import { getHost, getToken } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";

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
		values: { help, repo = await safeGetRepositoryFromConfig(), json },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "list"
		options: {
			json: { type: "boolean" },
			repo: { type: "string", short: "r" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: false,
	});

	if (help) {
		console.info(HELP);
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
