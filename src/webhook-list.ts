import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError } from "./lib/request";
import { getWebhooks } from "./webhook-view";

const HELP = `
List all webhooks in a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic webhook list [flags]

FLAGS
  -r, --repo string   Repository domain
      --json          Output as JSON
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
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
			json: { type: "boolean" },
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

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		handleUnauthenticated();
		return;
	}

	const response = await getWebhooks(repo);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else if (v.isValiError(response.error)) {
			console.error(
				`Failed to list webhooks: Invalid response: ${stringify(response.error.issues)}`,
			);
			process.exitCode = 1;
		} else {
			console.error(`Failed to list webhooks: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	const webhooks = response.value;
	if (json) {
		console.info(stringify(webhooks.map((w) => w.config)));
	} else {
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
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
