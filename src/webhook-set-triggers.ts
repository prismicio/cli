import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { stringify } from "./lib/json";
import { ForbiddenRequestError } from "./lib/request";
import { updateWebhook } from "./webhook-enable";
import { getWebhooks, TRIGGER_DISPLAY } from "./webhook-view";

const HELP = `
Usage: prismic webhook set-triggers <url> --repo <domain> --trigger <event> [--trigger <event>...]

Update which events trigger a webhook.

Arguments:
  <url>          Webhook URL

Options:
  -r, --repo     Repository domain (required)
  -t, --trigger  Trigger events (can be repeated, at least one required)
  -h, --help     Show this help message

Available triggers:
  document.published    When documents are published
  document.unpublished  When documents are unpublished
  release.created       When a release is created
  release.updated       When a release is edited or deleted
  tag.created           When a tag is created
  tag.deleted           When a tag is deleted
`.trim();

const VALID_TRIGGERS = Object.values(TRIGGER_DISPLAY);

export async function webhookSetTriggers(): Promise<void> {
	const {
		values: { help, repo, trigger },
		positionals: [webhookUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "set-triggers"
		options: {
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
			trigger: { type: "string", multiple: true, short: "t" },
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
		console.error("Missing required option: --repo");
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
		if (!VALID_TRIGGERS.includes(t)) {
			console.error(`Invalid trigger: ${t}`);
			console.error(`Valid triggers: ${VALID_TRIGGERS.join(", ")}`);
			process.exitCode = 1;
			return;
		}
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		handleUnauthenticated();
		return;
	}

	const webhooksResponse = await getWebhooks(repo);
	if (!webhooksResponse.ok) {
		if (webhooksResponse.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to update webhook triggers: ${stringify(webhooksResponse.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	const webhook = webhooksResponse.value.find((w) => w.config.url === webhookUrl);
	if (!webhook) {
		console.error(`Webhook not found: ${webhookUrl}`);
		process.exitCode = 1;
		return;
	}

	// Build trigger settings: all false, then enable specified ones
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

	const response = await updateWebhook(repo, webhook.config._id, {
		...webhook.config,
		...triggers,
	});
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to update webhook triggers: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(`Webhook triggers updated: ${trigger.join(", ")}`);
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
