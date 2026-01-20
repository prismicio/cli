import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, type ParsedRequestResponse, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";

const HELP = `
Usage: prismic webhook view <url> --repo <domain>

View details of a webhook in a Prismic repository.

Arguments:
  <url>          Webhook URL

Options:
  -r, --repo     Repository domain (required)
  -h, --help     Show this help message
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
		values: { help, repo },
		positionals: [webhookUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "view"
		options: {
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
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

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		handleUnauthenticated();
		return;
	}

	const response = await getWebhooks(repo);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to view webhook: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	const webhook = response.value.find((w) => w.config.url === webhookUrl);
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

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}

const WebhookSchema = v.object({
	config: v.object({
		_id: v.string(),
		url: v.string(),
		active: v.boolean(),
		name: v.nullable(v.string()),
		secret: v.nullable(v.string()),
		headers: v.record(v.string(), v.string()),
		documentsPublished: v.boolean(),
		documentsUnpublished: v.boolean(),
		releasesCreated: v.boolean(),
		releasesUpdated: v.boolean(),
		tagsCreated: v.boolean(),
		tagsDeleted: v.boolean(),
	}),
});
export type Webhook = v.InferOutput<typeof WebhookSchema>;

export async function getWebhooks(repo: string): Promise<ParsedRequestResponse<Webhook[]>> {
	const url = new URL("/app/settings/webhooks", await getRepoUrl(repo));
	return await request(url, { schema: v.array(WebhookSchema) });
}
