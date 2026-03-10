import { parseArgs } from "node:util";

import { createWebhook } from "./clients/wroom";
import { getHost, getToken } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { UnknownRequestError } from "./lib/request";
import { TRIGGER_DISPLAY } from "./webhook-view";

const HELP = `
Create a new webhook in a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic webhook create <url> [flags]

ARGUMENTS
  <url>   Webhook URL to receive events

FLAGS
  -n, --name string      Webhook name
  -s, --secret string    Secret for webhook signature
  -t, --trigger string   Trigger events (can be repeated)
  -r, --repo string      Repository domain
  -h, --help             Show help for command

TRIGGERS
  document.published    When documents are published
  document.unpublished  When documents are unpublished
  release.created       When a release is created
  release.updated       When a release is edited or deleted
  tag.created           When a tag is created
  tag.deleted           When a tag is deleted

If no triggers specified, all are enabled.

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

const VALID_TRIGGERS = Object.values(TRIGGER_DISPLAY);

export async function webhookCreate(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig(), name, secret, trigger = [] },
		positionals: [webhookUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "create"
		options: {
			name: { type: "string", short: "n" },
			secret: { type: "string", short: "s" },
			trigger: { type: "string", multiple: true, short: "t" },
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

	// Validate triggers
	for (const t of trigger) {
		if (!VALID_TRIGGERS.includes(t)) {
			console.error(`Invalid trigger: ${t}`);
			console.error(`Valid triggers: ${VALID_TRIGGERS.join(", ")}`);
			process.exitCode = 1;
			return;
		}
	}

	// Build trigger settings
	const defaultValue = trigger.length > 0 ? false : true;
	const triggers: Record<keyof typeof TRIGGER_DISPLAY, boolean> = {
		documentsPublished: defaultValue,
		documentsUnpublished: defaultValue,
		releasesCreated: defaultValue,
		releasesUpdated: defaultValue,
		tagsCreated: defaultValue,
		tagsDeleted: defaultValue,
	};
	for (const t of trigger) {
		const [apiField] = Object.entries(TRIGGER_DISPLAY).find(([, display]) => t === display) ?? [];
		if (!apiField) continue;
		triggers[apiField as keyof typeof TRIGGER_DISPLAY] = true;
	}

	const token = await getToken();
	const host = await getHost();

	try {
		await createWebhook(
			{
				url: webhookUrl,
				name: name ?? null,
				secret: secret ?? null,
				...triggers,
			},
			{ repo, token, host },
		);
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			console.error(`Failed to create webhook: ${message}`);
			process.exitCode = 1;
			return;
		}
		throw error;
	}

	console.info(`Webhook created: ${webhookUrl}`);
}
