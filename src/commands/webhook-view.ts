import { parseArgs } from "node:util";

import { getWebhooks } from "../clients/wroom";
import { getHost, getToken } from "../auth";
import { safeGetRepositoryName } from "../project";

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

export const TRIGGER_DISPLAY = {
	documentsPublished: "document.published",
	documentsUnpublished: "document.unpublished",
	releasesCreated: "release.created",
	releasesUpdated: "release.updated",
	tagsCreated: "tag.created",
	tagsDeleted: "tag.deleted",
};

export async function webhookView(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryName() },
		positionals: [webhookUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "view"
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

	const webhook = webhooks.find((webhook) => webhook.config.url === webhookUrl);
	if (!webhook) {
		console.error(`Webhook not found: ${webhookUrl}`);
		process.exitCode = 1;
		return;
	}

	const { config } = webhook;

	console.info(`URL:     ${config.url}`);
	console.info(`Name:    ${config.name || "(none)"}`);
	console.info(`Status:  ${config.active ? "enabled" : "disabled"}`);
	console.info(`Secret:  ${config.secret ? "(set)" : "(none)"}`);

	// Show triggers
	const enabledTriggers: string[] = [];
	for (const [apiField, displayName] of Object.entries(TRIGGER_DISPLAY)) {
		if (config[apiField as keyof typeof config]) {
			enabledTriggers.push(displayName);
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
