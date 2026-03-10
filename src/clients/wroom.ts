import * as v from "valibot";

import { env } from "../lib/env";
import { request } from "../lib/request";

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
type Webhook = v.InferOutput<typeof WebhookSchema>;

export async function getWebhooks(config: {
	repo: string;
	token: string | undefined;
	host: string | undefined;
}): Promise<Webhook[]> {
	const { repo, token, host } = config;
	const wroomUrl = getWroomUrl(repo, host);
	const url = new URL("app/settings/webhooks", wroomUrl);
	const response = await request(url, {
		credentials: { "prismic-auth": token },
		schema: v.array(WebhookSchema),
	});
	return response;
}

export async function triggerWebhook(
	id: string,
	config: { repo: string; token: string | undefined; host: string | undefined },
): Promise<void> {
	const { repo, token, host } = config;
	const wroomUrl = getWroomUrl(repo, host);
	const url = new URL(`app/settings/webhooks/${id}/trigger`, wroomUrl);
	await request(url, {
		method: "POST",
		credentials: { "prismic-auth": token },
	});
}

export async function createWebhook(
	webhookConfig: Omit<Webhook["config"], "_id" | "active" | "headers">,
	config: { repo: string; token: string | undefined; host: string | undefined },
): Promise<void> {
	const { repo, token, host } = config;
	const wroomUrl = getWroomUrl(repo, host);
	const url = new URL(`app/settings/webhooks/create`, wroomUrl);
	const body = new FormData();
	body.set("url", webhookConfig.url);
	body.set("name", webhookConfig.name ?? "");
	body.set("secret", webhookConfig.secret ?? "");
	body.set("headers", JSON.stringify({}));
	body.set("active", "on");
	body.set("documentsPublished", webhookConfig.documentsUnpublished.toString());
	body.set("documentsUnpublished", webhookConfig.documentsUnpublished.toString());
	body.set("releasesCreated", webhookConfig.documentsUnpublished.toString());
	body.set("releasesUpdated", webhookConfig.documentsUnpublished.toString());
	body.set("tagsCreated", webhookConfig.documentsUnpublished.toString());
	body.set("documentsPublished", webhookConfig.documentsUnpublished.toString());
	await request(url, {
		method: "POST",
		body,
		credentials: { "prismic-auth": token },
	});
}

export async function updateWebhook(
	id: string,
	webhookConfig: Omit<Webhook["config"], "_id">,
	config: { repo: string; token: string | undefined; host: string | undefined },
): Promise<void> {
	const { repo, token, host } = config;
	const wroomUrl = getWroomUrl(repo, host);
	const url = new URL(`app/settings/webhooks/${id}`, wroomUrl);
	const body = new FormData();
	body.set("url", webhookConfig.url);
	body.set("name", webhookConfig.name ?? "");
	body.set("secret", webhookConfig.secret ?? "");
	body.set("headers", JSON.stringify(webhookConfig.headers ?? {}));
	body.set("active", webhookConfig.active ? "on" : "off");
	body.set("documentsPublished", webhookConfig.documentsUnpublished.toString());
	body.set("documentsUnpublished", webhookConfig.documentsUnpublished.toString());
	body.set("releasesCreated", webhookConfig.documentsUnpublished.toString());
	body.set("releasesUpdated", webhookConfig.documentsUnpublished.toString());
	body.set("tagsCreated", webhookConfig.documentsUnpublished.toString());
	body.set("documentsPublished", webhookConfig.documentsUnpublished.toString());
	await request(url, {
		method: "POST",
		body,
		credentials: { "prismic-auth": token },
	});
}

export async function deleteWebhook(
	id: string,
	config: { repo: string; token: string | undefined; host: string | undefined },
): Promise<void> {
	const { repo, token, host } = config;
	const wroomUrl = getWroomUrl(repo, host);
	const url = new URL(`app/settings/webhooks/${id}/delete`, wroomUrl);
	await request(url, {
		method: "POST",
		credentials: { "prismic-auth": token },
	});
}

function getWroomUrl(repo: string, host = env.PRISMIC_HOST): URL {
	return new URL(`https://${repo}.${host}/`);
}
