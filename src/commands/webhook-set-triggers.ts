import { parseArgs } from "node:util";

import { getHost, getToken } from "../auth";
import { getWebhooks, updateWebhook, WEBHOOK_TRIGGERS } from "../clients/wroom";
import { UnknownRequestError } from "../lib/request";
import { safeGetRepositoryName } from "../project";

const HELP = `
Update which events trigger a webhook.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic webhook set-triggers <url> [flags]

ARGUMENTS
  <url>   Webhook URL

FLAGS
  -t, --trigger string   Trigger events (can be repeated, at least one required)
  -r, --repo string      Repository domain
  -h, --help             Show help for command

TRIGGERS
  documentsPublished    When documents are published
  documentsUnpublished  When documents are unpublished
  releasesCreated       When a release is created
  releasesUpdated       When a release is edited or deleted
  tagsCreated           When a tag is created
  tagsDeleted           When a tag is deleted

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function webhookSetTriggers(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryName(), trigger },
		positionals: [webhookUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "set-triggers"
		options: {
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

	if (!trigger || trigger.length === 0) {
		console.error("Missing required option: --trigger");
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
	const webhooks = await getWebhooks({ repo, token, host });
	const webhook = webhooks.find((w) => w.config.url === webhookUrl);
	if (!webhook) {
		console.error(`Webhook not found: ${webhookUrl}`);
		process.exitCode = 1;
		return;
	}

	const id = webhook.config._id;

	try {
		await updateWebhook(
			id,
			{
				...webhook.config,
				documentsPublished: trigger.includes("documentsPublished"),
				documentsUnpublished: trigger.includes("documentsUnpublished"),
				releasesCreated: trigger.includes("releasesCreated"),
				releasesUpdated: trigger.includes("releasesUpdated"),
				tagsCreated: trigger.includes("tagsCreated"),
				tagsDeleted: trigger.includes("tagsDeleted"),
			},
			{ repo, token, host },
		);
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			console.error(`Failed to update webhook triggers: ${message}`);
			process.exitCode = 1;
			return;
		}
		throw error;
	}

	console.info(`Webhook triggers updated: ${trigger.join(", ")}`);
}
