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

export function getWebhooks(config: WroomConfig): Promise<Webhook[]> {
	const { repo, host } = config;
	const url = new URL("app/settings/webhooks", getWroomRepoServiceUrl(repo, host));
	return wroomRepoServiceRequest(url, config, {
		schema: z.array(WebhookSchema),
		unknownErrorMessage: "Failed to load webhooks",
	});
}

export async function createWebhook(
	webhookConfig: Omit<Webhook["config"], "_id" | "active" | "headers">,
	config: WroomConfig,
): Promise<void> {
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
	const { repo, host } = config;
	const url = new URL("app/settings/webhooks/create", getWroomRepoServiceUrl(repo, host));
	await wroomRepoServiceRequest(url, config, {
		method: "POST",
		body,
		unknownErrorMessage: "Failed to create webhook",
	});
}

export async function updateWebhook(
	id: string,
	webhookConfig: Omit<Webhook["config"], "_id">,
	config: WroomConfig,
): Promise<void> {
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
	const { repo, host } = config;
	const url = new URL(
		`app/settings/webhooks/${encodeURIComponent(id)}`,
		getWroomRepoServiceUrl(repo, host),
	);
	await wroomRepoServiceRequest(url, config, {
		method: "POST",
		body,
		notFoundMessage: "Webhook not found",
		unknownErrorMessage: "Failed to update webhook",
	});
}

export async function deleteWebhook(id: string, config: WroomConfig): Promise<void> {
	const { repo, host } = config;
	const url = new URL(
		`app/settings/webhooks/${encodeURIComponent(id)}/delete`,
		getWroomRepoServiceUrl(repo, host),
	);
	await wroomRepoServiceRequest(url, config, {
		method: "POST",
		notFoundMessage: "Webhook not found",
		unknownErrorMessage: "Failed to delete webhook",
	});
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

export function getOAuthApps(config: WroomConfig): Promise<OAuthApp[]> {
	const { repo, host } = config;
	const url = new URL("settings/security/contentapi", getWroomRepoServiceUrl(repo, host));
	return wroomRepoServiceRequest(url, config, {
		schema: z.array(OAuthAppSchema),
		unknownErrorMessage: "Failed to load OAuth apps",
	});
}

export async function createOAuthApp(name: string, config: WroomConfig): Promise<OAuthApp> {
	const { repo, host } = config;
	const url = new URL("settings/security/oauthapp", getWroomRepoServiceUrl(repo, host));
	return wroomRepoServiceRequest(url, config, {
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
	const { repo, host } = config;
	const url = new URL("settings/security/authorizations", getWroomRepoServiceUrl(repo, host));
	return wroomRepoServiceRequest(url, config, {
		method: "POST",
		json: { app: appId, scope },
		schema: AccessTokenSchema,
		unknownErrorMessage: "Failed to create token",
	});
}

export async function deleteOAuthAuthorization(authId: string, config: WroomConfig): Promise<void> {
	const { repo, host } = config;
	const url = new URL(
		`settings/security/authorizations/${encodeURIComponent(authId)}`,
		getWroomRepoServiceUrl(repo, host),
	);
	await wroomRepoServiceRequest(url, config, {
		method: "DELETE",
		notFoundMessage: "Token not found",
		unknownErrorMessage: "Failed to delete token",
	});
}

export function getWriteTokens(config: WroomConfig): Promise<WriteTokensInfo> {
	const { repo, host } = config;
	const url = new URL("settings/security/customtypesapi", getWroomRepoServiceUrl(repo, host));
	return wroomRepoServiceRequest(url, config, {
		schema: WriteTokensInfoSchema,
		unknownErrorMessage: "Failed to load write tokens",
	});
}

export async function createWriteToken(name: string, config: WroomConfig): Promise<WriteToken> {
	const { repo, host } = config;
	const url = new URL("settings/security/token", getWroomRepoServiceUrl(repo, host));
	return wroomRepoServiceRequest(url, config, {
		method: "POST",
		json: { app_name: name },
		schema: WriteTokenSchema,
		unknownErrorMessage: "Failed to create write token",
	});
}

export async function deleteWriteToken(tokenValue: string, config: WroomConfig): Promise<void> {
	const { repo, host } = config;
	const url = new URL(
		`settings/security/token/${encodeURIComponent(tokenValue)}`,
		getWroomRepoServiceUrl(repo, host),
	);
	await wroomRepoServiceRequest(url, config, {
		method: "DELETE",
		notFoundMessage: `Token not found: ${tokenValue}`,
		unknownErrorMessage: "Failed to delete write token",
	});
}

export async function checkIsDomainAvailable(config: {
	domain: string;
	token: string | undefined;
	host: string;
}): Promise<boolean> {
	const { domain, host } = config;
	const url = new URL(
		`app/dashboard/repositories/${encodeURIComponent(domain)}/exists`,
		getWroomServiceUrl(host),
	);
	return wroomServiceRequest(url, config, { schema: z.boolean() });
}

export async function createRepository(config: {
	domain: string;
	name: string;
	framework: string;
	agent: string | undefined;
	token: string | undefined;
	host: string;
}): Promise<void> {
	const { domain, name, framework, agent, host } = config;
	const url = new URL("app/dashboard/repositories", getWroomServiceUrl(host));
	url.searchParams.set("app", "cli");
	if (agent) url.searchParams.set("agent", agent);
	await wroomServiceRequest(url, config, {
		method: "POST",
		json: { domain, name, framework, plan: "personal" },
		unknownErrorMessage: "Failed to create repository",
	});
}

const SyncStateSchema = z.object({
	repository: z.object({
		api_access: z.string(),
	}),
});

export async function getRepositoryAccess(config: WroomConfig): Promise<string> {
	const { repo, host } = config;
	const url = new URL("syncState", getWroomRepoServiceUrl(repo, host));
	const response = await wroomRepoServiceRequest(url, config, {
		schema: SyncStateSchema,
		unknownErrorMessage: "Failed to load repository access",
	});
	return response.repository.api_access;
}

export type RepositoryAccessLevel = "private" | "public" | "open";

export async function setRepositoryAccess(
	level: RepositoryAccessLevel,
	config: WroomConfig,
): Promise<void> {
	const { repo, host } = config;
	const url = new URL("settings/security/apiaccess", getWroomRepoServiceUrl(repo, host));
	await wroomRepoServiceRequest(url, config, {
		method: "POST",
		json: { api_access: level },
		unknownErrorMessage: "Failed to set repository access",
	});
}

const SetNameResponseSchema = z.object({
	repository: z.object({
		name: z.string(),
	}),
});

export async function setRepositoryName(name: string, config: WroomConfig): Promise<string> {
	const formData = new FormData();
	formData.set("displayname", name);
	const { repo, host } = config;
	const url = new URL("app/settings/repository", getWroomRepoServiceUrl(repo, host));
	const response = await wroomRepoServiceRequest(url, config, {
		method: "POST",
		body: formData,
		schema: SetNameResponseSchema,
		unknownErrorMessage: "Failed to set repository name",
	});
	return response.repository.name;
}

function wroomRepoServiceRequest<T>(
	url: URL,
	config: WroomConfig,
	options: RequestOptions<T> = {},
): Promise<T> {
	return request(url, {
		credentials: { "prismic-auth": config.token },
		notFoundMessage: `Repository not found: ${config.repo}`,
		...options,
	});
}

function wroomServiceRequest<T>(
	url: URL,
	config: { token: string | undefined; host: string },
	options: RequestOptions<T> = {},
): Promise<T> {
	return request(url, {
		credentials: { "prismic-auth": config.token },
		...options,
	});
}

function getWroomRepoServiceUrl(repo: string, host: string): URL {
	return new URL(`https://${repo}.${host}/`);
}

function getWroomServiceUrl(host: string): URL {
	return new URL(`https://${host}/`);
}
