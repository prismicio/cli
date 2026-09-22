import * as z from "zod/mini";

import { request, type RequestOptions } from "../../request";

type WroomConfig = {
	repo: string;
	token: string | undefined;
	host: string;
};

const WebhookTriggersSchema = z.object({
	documentsPublished: z.boolean(),
	documentsUnpublished: z.boolean(),
	releasesCreated: z.boolean(),
	releasesUpdated: z.boolean(),
	tagsCreated: z.boolean(),
	tagsDeleted: z.boolean(),
});

export type WebhookTriggers = z.infer<typeof WebhookTriggersSchema>;

export const WEBHOOK_TRIGGERS = Object.keys(
	WebhookTriggersSchema.shape,
) as (keyof WebhookTriggers)[];

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

export async function getWebhooks(config: WroomConfig): Promise<Webhook[]> {
	return wroomRequest("app/settings/webhooks", config, {
		schema: z.array(WebhookSchema),
		unknownErrorMessage: "Failed to load webhooks",
	});
}

export async function createWebhook(
	webhookConfig: Omit<Webhook["config"], "_id" | "active" | "headers">,
	config: WroomConfig,
): Promise<void> {
	await wroomRequest("app/settings/webhooks/create", config, {
		method: "POST",
		body: toWebhookFormData({ ...webhookConfig, active: true, headers: {} }),
		unknownErrorMessage: "Failed to create webhook",
	});
}

export async function updateWebhook(
	id: string,
	webhookConfig: Omit<Webhook["config"], "_id">,
	config: WroomConfig,
): Promise<void> {
	await wroomRequest(`app/settings/webhooks/${encodeURIComponent(id)}`, config, {
		method: "POST",
		body: toWebhookFormData(webhookConfig),
		notFoundMessage: `Webhook not found: ${id}`,
		unknownErrorMessage: "Failed to update webhook",
	});
}

export async function deleteWebhook(id: string, config: WroomConfig): Promise<void> {
	await wroomRequest(`app/settings/webhooks/${encodeURIComponent(id)}/delete`, config, {
		method: "POST",
		notFoundMessage: `Webhook not found: ${id}`,
		unknownErrorMessage: "Failed to delete webhook",
	});
}

function toWebhookFormData(webhook: Omit<Webhook["config"], "_id">): FormData {
	const body = new FormData();
	body.set("url", webhook.url);
	body.set("name", webhook.name ?? "");
	body.set("secret", webhook.secret ?? "");
	body.set("headers", JSON.stringify(webhook.headers));
	body.set("active", webhook.active ? "on" : "off");
	for (const trigger of WEBHOOK_TRIGGERS) {
		body.set(trigger, String(webhook[trigger]));
	}
	return body;
}

const AccessTokenSchema = z.object({
	id: z.string(),
	scope: z.string(),
	token: z.string(),
	created_at: z.object({ $date: z.number() }),
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

export async function getOAuthApps(config: WroomConfig): Promise<OAuthApp[]> {
	return wroomRequest("settings/security/contentapi", config, {
		schema: z.array(OAuthAppSchema),
		unknownErrorMessage: "Failed to load OAuth apps",
	});
}

export async function createOAuthApp(name: string, config: WroomConfig): Promise<OAuthApp> {
	return wroomRequest("settings/security/oauthapp", config, {
		method: "POST",
		json: { app_name: name },
		schema: OAuthAppSchema,
		unknownErrorMessage: "Failed to create OAuth app",
	});
}

export async function createOAuthAuthorization(
	appId: string,
	scope: string,
	config: WroomConfig,
): Promise<AccessToken> {
	return wroomRequest("settings/security/authorizations", config, {
		method: "POST",
		json: { app: appId, scope },
		schema: AccessTokenSchema,
		unknownErrorMessage: "Failed to create token",
	});
}

export async function deleteOAuthAuthorization(authId: string, config: WroomConfig): Promise<void> {
	await wroomRequest(`settings/security/authorizations/${encodeURIComponent(authId)}`, config, {
		method: "DELETE",
		notFoundMessage: `Token not found: ${authId}`,
		unknownErrorMessage: "Failed to delete token",
	});
}

export async function getWriteTokens(config: WroomConfig): Promise<WriteTokensInfo> {
	return wroomRequest("settings/security/customtypesapi", config, {
		schema: WriteTokensInfoSchema,
		unknownErrorMessage: "Failed to load write tokens",
	});
}

export async function createWriteToken(name: string, config: WroomConfig): Promise<WriteToken> {
	return wroomRequest("settings/security/token", config, {
		method: "POST",
		json: { app_name: name },
		schema: WriteTokenSchema,
		unknownErrorMessage: "Failed to create write token",
	});
}

export async function deleteWriteToken(tokenValue: string, config: WroomConfig): Promise<void> {
	await wroomRequest(`settings/security/token/${encodeURIComponent(tokenValue)}`, config, {
		method: "DELETE",
		notFoundMessage: "Token not found",
		unknownErrorMessage: "Failed to delete write token",
	});
}

export async function checkIsDomainAvailable(config: {
	domain: string;
	token: string | undefined;
	host: string;
}): Promise<boolean> {
	const path = `app/dashboard/repositories/${encodeURIComponent(config.domain)}/exists`;
	return request(new URL(path, `https://${config.host}/`), {
		credentials: { "prismic-auth": config.token },
		schema: z.boolean(),
	});
}

export async function createRepository(config: {
	domain: string;
	name: string;
	framework: string;
	agent: string | undefined;
	token: string | undefined;
	host: string;
}): Promise<void> {
	const { domain, name, framework, agent, token, host } = config;
	const url = new URL("app/dashboard/repositories", `https://${host}/`);
	url.searchParams.set("app", "cli");
	if (agent) url.searchParams.set("agent", agent);
	await request(url, {
		method: "POST",
		credentials: { "prismic-auth": token },
		json: { domain, name, framework, plan: "personal" },
		unknownErrorMessage: "Failed to create repository",
	});
}

export async function getRepositoryAccess(config: WroomConfig): Promise<string> {
	const response = await wroomRequest("syncState", config, {
		schema: z.object({ repository: z.object({ api_access: z.string() }) }),
		unknownErrorMessage: "Failed to load repository access",
	});
	return response.repository.api_access;
}

export async function setRepositoryAccess(level: string, config: WroomConfig): Promise<void> {
	await wroomRequest("settings/security/apiaccess", config, {
		method: "POST",
		json: { api_access: level },
		unknownErrorMessage: "Failed to set repository access",
	});
}

export async function setRepositoryName(name: string, config: WroomConfig): Promise<string> {
	const body = new FormData();
	body.set("displayname", name);
	const response = await wroomRequest("app/settings/repository", config, {
		method: "POST",
		body,
		schema: z.object({ repository: z.object({ name: z.string() }) }),
		unknownErrorMessage: "Failed to set repository name",
	});
	return response.repository.name;
}

async function wroomRequest<T>(
	path: string,
	config: WroomConfig,
	options: RequestOptions<T>,
): Promise<T> {
	return request(new URL(path, `https://${config.repo}.${config.host}/`), {
		credentials: { "prismic-auth": config.token },
		notFoundMessage: `Repository not found: ${config.repo}`,
		...options,
	});
}
