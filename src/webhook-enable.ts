import { parseArgs } from "node:util";

import type { RequestResponse } from "./lib/request";

import { isAuthenticated } from "./lib/auth";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";
import { getWebhooks, type Webhook } from "./webhook-view";

const HELP = `
Usage: prismic webhook enable <url> --repo <domain>

Enable a webhook in a Prismic repository.

Arguments:
  <url>          Webhook URL

Options:
  -r, --repo     Repository domain (required)
  -h, --help     Show this help message
`.trim();

export async function webhookEnable(): Promise<void> {
	const {
		values: { help, repo },
		positionals: [webhookUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "webhook", "enable"
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

	const webhooksResponse = await getWebhooks(repo);
	if (!webhooksResponse.ok) {
		if (webhooksResponse.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to enable webhook: ${stringify(webhooksResponse.value)}`);
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

	if (webhook.config.active) {
		console.info(`Webhook already enabled: ${webhookUrl}`);
		return;
	}

	const updatedConfig = structuredClone(webhook.config);
	updatedConfig.active = true;

	const response = await updateWebhook(repo, webhook.config._id, updatedConfig);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to enable webhook: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(`Webhook enabled: ${webhookUrl}`);
}

export async function updateWebhook(
	repo: string,
	webhookId: string,
	config: Omit<Webhook["config"], "_id">,
): Promise<RequestResponse<unknown>> {
	const url = new URL(`/app/settings/webhooks/${webhookId}`, await getRepoUrl(repo));
	const body = new FormData();
	body.set("url", config.url);
	body.set("name", config.name ?? "");
	body.set("secret", config.secret ?? "");
	body.set("headers", JSON.stringify(config.headers ?? {}));
	body.set("active", config.active ? "on" : "off");
	body.set("documentsPublished", config.documentsUnpublished.toString());
	body.set("documentsUnpublished", config.documentsUnpublished.toString());
	body.set("releasesCreated", config.documentsUnpublished.toString());
	body.set("releasesUpdated", config.documentsUnpublished.toString());
	body.set("tagsCreated", config.documentsUnpublished.toString());
	body.set("documentsPublished", config.documentsUnpublished.toString());
	return await request(url, { method: "POST", body });
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
