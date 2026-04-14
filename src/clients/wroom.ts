import * as z from "zod/mini";

import { NotFoundRequestError, request } from "../lib/request";

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
	try {
		return await request(url, {
			credentials: { "prismic-auth": token },
			schema: z.array(WebhookSchema),
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${repo}`;
		}
		throw error;
	}
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
	try {
		await request(url, {
			method: "POST",
			body,
			credentials: { "prismic-auth": token },
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${repo}`;
		}
		throw error;
	}
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
	try {
		await request(url, {
			method: "POST",
			body,
			credentials: { "prismic-auth": token },
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = "Webhook not found";
		}
		throw error;
	}
}

export async function deleteWebhook(
	id: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const { repo, token, host } = config;
	const wroomUrl = getWroomUrl(repo, host);
	const url = new URL(`app/settings/webhooks/${id}/delete`, wroomUrl);
	try {
		await request(url, {
			method: "POST",
			credentials: { "prismic-auth": token },
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = "Webhook not found";
		}
		throw error;
	}
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

export async function getOAuthApps(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<OAuthApp[]> {
	const url = new URL("settings/security/contentapi", getWroomUrl(config.repo, config.host));
	try {
		return await request(url, {
			credentials: { "prismic-auth": config.token },
			schema: z.array(OAuthAppSchema),
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${config.repo}`;
		}
		throw error;
	}
}

export async function createOAuthApp(
	name: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<OAuthApp> {
	const url = new URL("settings/security/oauthapp", getWroomUrl(config.repo, config.host));
	try {
		return await request(url, {
			method: "POST",
			body: { app_name: name },
			credentials: { "prismic-auth": config.token },
			schema: OAuthAppSchema,
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${config.repo}`;
		}
		throw error;
	}
}

export async function createOAuthAuthorization(
	appId: string,
	scope: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<AccessToken> {
	const url = new URL("settings/security/authorizations", getWroomUrl(config.repo, config.host));
	try {
		return await request(url, {
			method: "POST",
			body: { app: appId, scope },
			credentials: { "prismic-auth": config.token },
			schema: AccessTokenSchema,
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${config.repo}`;
		}
		throw error;
	}
}

export async function deleteOAuthAuthorization(
	authId: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const url = new URL(
		`settings/security/authorizations/${encodeURIComponent(authId)}`,
		getWroomUrl(config.repo, config.host),
	);
	try {
		await request(url, {
			method: "DELETE",
			credentials: { "prismic-auth": config.token },
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = "Token not found";
		}
		throw error;
	}
}

export async function getWriteTokens(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<WriteTokensInfo> {
	const url = new URL("settings/security/customtypesapi", getWroomUrl(config.repo, config.host));
	try {
		return await request(url, {
			credentials: { "prismic-auth": config.token },
			schema: WriteTokensInfoSchema,
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${config.repo}`;
		}
		throw error;
	}
}

export async function createWriteToken(
	name: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<WriteToken> {
	const url = new URL("settings/security/token", getWroomUrl(config.repo, config.host));
	try {
		return await request(url, {
			method: "POST",
			body: { app_name: name },
			credentials: { "prismic-auth": config.token },
			schema: WriteTokenSchema,
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${config.repo}`;
		}
		throw error;
	}
}

export async function deleteWriteToken(
	tokenValue: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const url = new URL(
		`settings/security/token/${encodeURIComponent(tokenValue)}`,
		getWroomUrl(config.repo, config.host),
	);
	try {
		await request(url, {
			method: "DELETE",
			credentials: { "prismic-auth": config.token },
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Token not found: ${tokenValue}`;
		}
		throw error;
	}
}

export async function checkIsDomainAvailable(config: {
	domain: string;
	token: string | undefined;
	host: string;
}): Promise<boolean> {
	const { domain, token, host } = config;
	const url = new URL(`app/dashboard/repositories/${domain}/exists`, getDashboardUrl(host));
	const response = await request(url, {
		credentials: { "prismic-auth": token },
		schema: z.boolean(),
	});
	return response;
}

export async function createRepository(config: {
	domain: string;
	name: string;
	framework: string;
	token: string | undefined;
	host: string;
}): Promise<void> {
	const { domain, name, framework, token, host } = config;
	const url = new URL("app/dashboard/repositories", getDashboardUrl(host));
	await request(url, {
		method: "POST",
		body: { domain, name, framework, plan: "personal" },
		credentials: { "prismic-auth": token },
	});
}

const SyncStateSchema = z.object({
	repository: z.object({
		api_access: z.string(),
	}),
});

export async function getRepositoryAccess(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<string> {
	const { repo, token, host } = config;
	const url = new URL("syncState", getWroomUrl(repo, host));
	try {
		const response = await request(url, {
			credentials: { "prismic-auth": token },
			schema: SyncStateSchema,
		});
		return response.repository.api_access;
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${repo}`;
		}
		throw error;
	}
}

export type RepositoryAccessLevel = "private" | "public" | "open";

export async function setRepositoryAccess(
	level: RepositoryAccessLevel,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const { repo, token, host } = config;
	const url = new URL("settings/security/apiaccess", getWroomUrl(repo, host));
	try {
		await request(url, {
			method: "POST",
			body: { api_access: level },
			credentials: { "prismic-auth": token },
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${repo}`;
		}
		throw error;
	}
}

const SetNameResponseSchema = z.object({
	repository: z.object({
		name: z.string(),
	}),
});

export async function setRepositoryName(
	name: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<string> {
	const { repo, token, host } = config;
	const url = new URL("app/settings/repository", getWroomUrl(repo, host));
	const formData = new FormData();
	formData.set("displayname", name);
	try {
		const response = await request(url, {
			method: "POST",
			body: formData,
			credentials: { "prismic-auth": token },
			schema: SetNameResponseSchema,
		});
		return response.repository.name;
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${repo}`;
		}
		throw error;
	}
}

function getDashboardUrl(host: string): URL {
	return new URL(`https://${host}/`);
}

function getWroomUrl(repo: string, host: string): URL {
	return new URL(`https://${repo}.${host}/`);
}
