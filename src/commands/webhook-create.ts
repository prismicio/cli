import { parseArgs } from "node:util";

import { getHost, getToken } from "../auth";
import { createWebhook, WEBHOOK_TRIGGERS } from "../clients/wroom";
import { UnknownRequestError } from "../lib/request";
import { safeGetRepositoryName } from "../project";

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
  documentsPublished    When documents are published
  documentsUnpublished  When documents are unpublished
  releasesCreated       When a release is created
  releasesUpdated       When a release is edited or deleted
  tagsCreated           When a tag is created
  tagsDeleted           When a tag is deleted

If no triggers specified, all are enabled.

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function webhookCreate(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryName(), name, secret, trigger = [] },
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
		if (!WEBHOOK_TRIGGERS.includes(t)) {
			console.error(`Invalid trigger: ${t}`);
			console.error(`Valid triggers: ${WEBHOOK_TRIGGERS.join(", ")}`);
			process.exitCode = 1;
			return;
		}
	}

	const token = await getToken();
	const host = await getHost();

	const defaultValue = trigger.length > 0 ? false : true;

	try {
		await createWebhook(
			{
				url: webhookUrl,
				name: name ?? null,
				secret: secret ?? null,
				documentsPublished: trigger.includes("documentsPublished") || defaultValue,
				documentsUnpublished: trigger.includes("documentsUnpublished") || defaultValue,
				releasesCreated: trigger.includes("releasesCreated") || defaultValue,
				releasesUpdated: trigger.includes("releasesUpdated") || defaultValue,
				tagsCreated: trigger.includes("tagsCreated") || defaultValue,
				tagsDeleted: trigger.includes("tagsDeleted") || defaultValue,
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
