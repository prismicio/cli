import * as z from "zod/mini";

import { request } from "../lib/request";

const WebhookTriggersSchema = z.object({
	documentsPublished: z.boolean(),
	documentsUnpublished: z.boolean(),
	releasesCreated: z.boolean(),
	releasesUpdated: z.boolean(),
	tagsCreated: z.boolean(),
	tagsDeleted: z.boolean(),
});

export const WEBHOOK_TRIGGERS = Object.keys(WebhookTriggersSchema.shape);

const WebhookSchema = z.object({
	config: z.extend(WebhookTriggersSchema, {
		_id: z.string(),
		url: z.string(),
		active: z.boolean(),
		name: z.nullable(z.string()),
		secret: z.nullable(z.string()),
		headers: z.record(z.string(), z.string()),
	}),
});
type Webhook = z.infer<typeof WebhookSchema>;

export async function getWebhooks(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<Webhook[]> {
	const { repo, token, host } = config;
	const wroomUrl = getWroomUrl(repo, host);
	const url = new URL("app/settings/webhooks", wroomUrl);
	const response = await request(url, {
		credentials: { "prismic-auth": token },
		schema: z.array(WebhookSchema),
	});
	return response;
}

export async function createWebhook(
	webhookConfig: Omit<Webhook["config"], "_id" | "active" | "headers">,
	config: { repo: string; token: string | undefined; host: string },
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
	body.set("documentsPublished", webhookConfig.documentsPublished.toString());
	body.set("documentsUnpublished", webhookConfig.documentsUnpublished.toString());
	body.set("releasesCreated", webhookConfig.releasesCreated.toString());
	body.set("releasesUpdated", webhookConfig.releasesUpdated.toString());
	body.set("tagsCreated", webhookConfig.tagsCreated.toString());
	body.set("tagsDeleted", webhookConfig.tagsDeleted.toString());
	await request(url, {
		method: "POST",
		body,
		credentials: { "prismic-auth": token },
	});
}

export async function updateWebhook(
	id: string,
	webhookConfig: Omit<Webhook["config"], "_id">,
	config: { repo: string; token: string | undefined; host: string },
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
	body.set("documentsPublished", webhookConfig.documentsPublished.toString());
	body.set("documentsUnpublished", webhookConfig.documentsUnpublished.toString());
	body.set("releasesCreated", webhookConfig.releasesCreated.toString());
	body.set("releasesUpdated", webhookConfig.releasesUpdated.toString());
	body.set("tagsCreated", webhookConfig.tagsCreated.toString());
	body.set("tagsDeleted", webhookConfig.tagsDeleted.toString());
	await request(url, {
		method: "POST",
		body,
		credentials: { "prismic-auth": token },
	});
}

export async function deleteWebhook(
	id: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const { repo, token, host } = config;
	const wroomUrl = getWroomUrl(repo, host);
	const url = new URL(`app/settings/webhooks/${id}/delete`, wroomUrl);
	await request(url, {
		method: "POST",
		credentials: { "prismic-auth": token },
	});
}

const MongoDBDateSchema = z.object({ $date: z.number() });

const AccessTokenSchema = z.object({
	id: z.string(),
	scope: z.string(),
	token: z.string(),
	created_at: MongoDBDateSchema,
});
type AccessToken = z.infer<typeof AccessTokenSchema>;

const OAuthAppSchema = z.object({
	id: z.string(),
	name: z.string(),
	wroom_auths: z.array(AccessTokenSchema),
});
type OAuthApp = z.infer<typeof OAuthAppSchema>;

const WriteTokenSchema = z.object({
	app_name: z.string(),
	token: z.string(),
	timestamp: z.number(),
});
type WriteToken = z.infer<typeof WriteTokenSchema>;

const WriteTokensInfoSchema = z.object({
	max_tokens: z.number(),
	tokens: z.array(WriteTokenSchema),
});
type WriteTokensInfo = z.infer<typeof WriteTokensInfoSchema>;

export async function getOAuthApps(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<OAuthApp[]> {
	const url = new URL("settings/security/contentapi", getWroomUrl(config.repo, config.host));
	return await request(url, {
		credentials: { "prismic-auth": config.token },
		schema: z.array(OAuthAppSchema),
	});
}

export async function getWriteTokens(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<WriteTokensInfo> {
	const url = new URL("settings/security/customtypesapi", getWroomUrl(config.repo, config.host));
	return await request(url, {
		credentials: { "prismic-auth": config.token },
		schema: WriteTokensInfoSchema,
	});
}

export async function createOAuthApp(
	name: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<OAuthApp> {
	const url = new URL("settings/security/oauthapp", getWroomUrl(config.repo, config.host));
	return await request(url, {
		method: "POST",
		body: { app_name: name },
		credentials: { "prismic-auth": config.token },
		schema: OAuthAppSchema,
	});
}

export async function createAuthorization(
	appId: string,
	scope: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<AccessToken> {
	const url = new URL("settings/security/authorizations", getWroomUrl(config.repo, config.host));
	return await request(url, {
		method: "POST",
		body: { app: appId, scope },
		credentials: { "prismic-auth": config.token },
		schema: AccessTokenSchema,
	});
}

export async function deleteAuthorization(
	authId: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const url = new URL(
		`settings/security/authorizations/${authId}`,
		getWroomUrl(config.repo, config.host),
	);
	await request(url, {
		method: "DELETE",
		credentials: { "prismic-auth": config.token },
	});
}

export async function createWriteToken(
	name: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<WriteToken> {
	const url = new URL("settings/security/token", getWroomUrl(config.repo, config.host));
	return await request(url, {
		method: "POST",
		body: { app_name: name },
		credentials: { "prismic-auth": config.token },
		schema: WriteTokenSchema,
	});
}

export async function deleteWriteToken(
	tokenValue: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const url = new URL(
		`settings/security/token/${tokenValue}`,
		getWroomUrl(config.repo, config.host),
	);
	await request(url, {
		method: "DELETE",
		credentials: { "prismic-auth": config.token },
	});
}

function getWroomUrl(repo: string, host: string): URL {
	return new URL(`https://${repo}.${host}/`);
}
