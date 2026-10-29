import { createHash } from "node:crypto";

import type { DynamicCustomTypeModel, SharedSliceModel } from "@prismicio/types-internal";
import * as z from "zod/mini";

import {
	ForbiddenRequestError,
	request,
	type RequestError,
	UnauthorizedRequestError,
} from "../request";
import { appendTrailingSlash } from "../url";

export type Credentials = {
	host: string;
	// With `login`, gets a new token by logging in, or nothing when a login
	// is not possible.
	getToken: (options?: { login?: boolean }) => Promise<string | undefined>;
};

export type RepositoryConfig = Credentials & { repo: string };

export async function refreshToken(token: string, config: { host: string }): Promise<string> {
	const url = new URL("refreshtoken", getAuthServiceUrl(config.host));
	url.searchParams.set("token", token);
	return request(url, { schema: z.string() });
}

const SessionSchema = z.union([
	z.object({ type: z.literal("USER"), email: z.string(), shortId: z.string() }),
	z.object({ type: z.literal("Machine2Machine"), domain: z.string(), appName: z.string() }),
]);

export async function validateToken(config: Credentials): Promise<z.infer<typeof SessionSchema>> {
	const url = new URL("validate", getAuthServiceUrl(config.host));
	const token = await config.getToken();
	if (token) url.searchParams.set("token", token);
	return request(url, {
		schema: SessionSchema,
		onAuthError: (error) => retryAfterLogin(error, config, validateToken),
	});
}

export async function hasValidToken(config: Credentials): Promise<boolean> {
	const token = await config.getToken();
	if (!token) return false;
	return validateToken({ host: config.host, getToken: tokenWithoutLogin(token) }).then(
		() => true,
		(error) => !(error instanceof UnauthorizedRequestError),
	);
}

function getAuthServiceUrl(host: string): URL {
	return new URL(`https://auth.${host}/`);
}

const ProfileSchema = z.object({
	email: z.string(),
	shortId: z.string(),
	intercomHash: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

// A role is a string (e.g. "Owner") for a repository with one role, or a
// record of locale to role (e.g. { "de-de": "Writer" }) when roles are
// locale-scoped. A Write API token sends a string role, or omits it.
const UserRepositorySchema = z.object({
	domain: z.string(),
	name: z.optional(z.string()),
	role: z.optional(z.union([z.string(), z.record(z.string(), z.string())])),
});

export async function getUserProfile(config: Credentials): Promise<Profile> {
	const url = new URL("user/profile", getUserServiceUrl(config.host));
	return request(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		schema: ProfileSchema,
		unknownErrorMessage: "Failed to load your profile",
		onAuthError: (error) => retryAfterLogin(error, config, getUserProfile),
	});
}

export async function getUserRepositories(
	config: Credentials,
): Promise<{ repositories: z.infer<typeof UserRepositorySchema>[] }> {
	const url = new URL("user/repositories", getUserServiceUrl(config.host));
	return request(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		schema: z.object({ repositories: z.array(UserRepositorySchema) }),
		unknownErrorMessage: "Failed to load your repositories",
		onAuthError: (error) => retryAfterLogin(error, config, getUserRepositories),
	});
}

function getUserServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/`);
}

const RepositorySchema = z.object({
	name: z.optional(z.string()),
	starter: z.nullish(
		z.object({
			id: z.string(),
			revision: z.string(),
			framework: z.string(),
			deploymentUrl: z.url(),
		}),
	),
	framework: z.optional(z.string()),
	quotas: z.optional(z.object({ sliceMachineEnabled: z.boolean() })),
});

export type Repository = z.infer<typeof RepositorySchema>;

export async function getRepository(config: RepositoryConfig): Promise<Repository> {
	const url = new URL("", getRepositoryServiceUrl(config.host));
	url.searchParams.set("repository", config.repo);
	return request(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}`, repository: config.repo },
		schema: RepositorySchema,
		notFoundMessage: `Repository not found: ${config.repo}`,
		onAuthError: (error) => retryAfterLogin(error, config, getRepository),
	});
}

export async function enableTypeBuilder(
	framework: string,
	config: RepositoryConfig,
): Promise<void> {
	const url = new URL("type-builder", getRepositoryServiceUrl(config.host));
	url.searchParams.set("repository", config.repo);
	await request(url, {
		method: "PATCH",
		json: { framework },
		headers: { Authorization: `Bearer ${await config.getToken()}`, repository: config.repo },
		notFoundMessage: `Repository not found: ${config.repo}`,
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => enableTypeBuilder(framework, config)),
	});
}

const OnboardingStateSchema = z.object({
	completedSteps: z.array(z.string()),
});
type OnboardingState = z.infer<typeof OnboardingStateSchema>;

export async function getOnboardingState(config: RepositoryConfig): Promise<OnboardingState> {
	const url = new URL("onboarding", getRepositoryServiceUrl(config.host));
	url.searchParams.set("repository", config.repo);
	return request(url, {
		credentials: { "prismic-auth": await config.getToken() },
		schema: OnboardingStateSchema,
		onAuthError: (error) => retryAfterLogin(error, config, getOnboardingState),
	});
}

export async function toggleOnboardingStep(
	stepId: string,
	config: RepositoryConfig,
): Promise<OnboardingState> {
	const url = new URL(
		`onboarding/${encodeURIComponent(stepId)}/toggle`,
		getRepositoryServiceUrl(config.host),
	);
	url.searchParams.set("repository", config.repo);
	return request(url, {
		method: "PATCH",
		credentials: { "prismic-auth": await config.getToken() },
		schema: OnboardingStateSchema,
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => toggleOnboardingStep(stepId, config)),
	});
}

function getRepositoryServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/repository/`);
}

export type CustomTypesConfig = RepositoryConfig & { releaseId?: string };

export async function getCustomTypes(config: CustomTypesConfig): Promise<DynamicCustomTypeModel[]> {
	const url = new URL("customtypes", getCustomTypesServiceUrl(config.host));
	if (config.releaseId) url.searchParams.set("release", config.releaseId);
	return request<DynamicCustomTypeModel[]>(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}`, repository: config.repo },
		notFoundMessage: `Repository not found: ${config.repo}`,
		onAuthError: (error) => retryAfterLogin(error, config, getCustomTypes),
	});
}

export async function getSlices(config: CustomTypesConfig): Promise<SharedSliceModel[]> {
	const url = new URL("slices", getCustomTypesServiceUrl(config.host));
	if (config.releaseId) url.searchParams.set("release", config.releaseId);
	return request<SharedSliceModel[]>(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}`, repository: config.repo },
		notFoundMessage: `Repository not found: ${config.repo}`,
		onAuthError: (error) => retryAfterLogin(error, config, getSlices),
	});
}

export type BulkModelChange = {
	type: `${"CUSTOM_TYPE" | "SLICE"}_${"INSERT" | "UPDATE" | "DELETE"}`;
	id: string;
	payload: DynamicCustomTypeModel | SharedSliceModel | { id: string };
};

export async function bulkUpdateModels(
	changes: BulkModelChange[],
	config: CustomTypesConfig,
): Promise<void> {
	const url = new URL("bulk-update", getCustomTypesServiceUrl(config.host));
	if (config.releaseId) url.searchParams.set("release", config.releaseId);
	await request(url, {
		method: "POST",
		json: { changes },
		headers: { Authorization: `Bearer ${await config.getToken()}`, repository: config.repo },
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to update models",
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => bulkUpdateModels(changes, config)),
	});
}

function getCustomTypesServiceUrl(host: string): URL {
	return new URL(`https://customtypes.${host}/`);
}

const ScreenshotPresignedUrlResponseSchema = z.object({
	values: z.object({
		url: z.string(),
		fields: z.record(z.string(), z.string()),
	}),
	imgixEndpoint: z.string(),
});

const SUPPORTED_IMAGE_MIME_TYPES: Record<string, string> = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/gif": ".gif",
	"image/webp": ".webp",
};

export async function deleteSliceScreenshots(
	sliceId: string,
	config: RepositoryConfig,
): Promise<void> {
	const url = new URL("delete", getScreenshotServiceUrl(config.host));
	url.searchParams.set("repository", config.repo);
	await request(url, {
		method: "POST",
		json: { sliceId },
		headers: { Authorization: `Bearer ${await config.getToken()}`, repository: config.repo },
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => deleteSliceScreenshots(sliceId, config)),
	});
}

export async function uploadSliceScreenshot(
	blob: Blob,
	config: RepositoryConfig & { sliceId: string; variationId: string },
): Promise<URL> {
	const { sliceId, variationId, repo } = config;

	const type = blob.type;
	if (!(type in SUPPORTED_IMAGE_MIME_TYPES)) {
		throw new UnsupportedFileTypeError(type);
	}

	const presigned = await getScreenshotUploadForm(config);

	const extension = SUPPORTED_IMAGE_MIME_TYPES[type];
	const digest = createHash("sha1")
		.update(new Uint8Array(await blob.arrayBuffer()))
		.digest("hex");
	const key = `${repo}/shared-slices/${sliceId}/${variationId}/${digest}${extension}`;

	const formData = new FormData();
	for (const [field, value] of Object.entries(presigned.values.fields)) {
		formData.append(field, value);
	}
	formData.set("key", key);
	formData.set("Content-Type", type);
	formData.set("file", blob);

	await request(presigned.values.url, { method: "POST", body: formData });

	const url = new URL(key, appendTrailingSlash(presigned.imgixEndpoint));
	url.searchParams.set("auto", "compress,format");

	return url;
}

async function getScreenshotUploadForm(
	config: RepositoryConfig,
): Promise<z.infer<typeof ScreenshotPresignedUrlResponseSchema>> {
	const url = new URL("presigned-url", getScreenshotServiceUrl(config.host));
	url.searchParams.set("repository", config.repo);
	return request(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}`, repository: config.repo },
		schema: ScreenshotPresignedUrlResponseSchema,
		onAuthError: (error) => retryAfterLogin(error, config, getScreenshotUploadForm),
	});
}

export class UnsupportedFileTypeError extends Error {
	name = "UnsupportedFileTypeError";

	constructor(mimeType: string) {
		const supportedTypes = Object.keys(SUPPORTED_IMAGE_MIME_TYPES);
		super(
			`Unsupported file type: ${mimeType || "unknown"}. Supported: ${supportedTypes.join(", ")}`,
		);
	}
}

function getScreenshotServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/screenshot/`);
}

const LocaleSchema = z.object({
	id: z.string(),
	label: z.string(),
	customName: z.nullable(z.string()),
	isMaster: z.boolean(),
});

export type Locale = z.infer<typeof LocaleSchema>;

export async function getLocales(config: RepositoryConfig): Promise<{ results: Locale[] }> {
	const url = new URL("repository/locales", getLocaleServiceUrl(config.host));
	url.searchParams.set("repository", config.repo);
	return request(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		schema: z.object({ results: z.array(LocaleSchema) }),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to load locales",
		onAuthError: (error) => retryAfterLogin(error, config, getLocales),
	});
}

export async function upsertLocale(
	locale: { id: string; isMaster?: boolean; customName?: string },
	config: RepositoryConfig,
): Promise<Locale> {
	const url = new URL("repository/locales", getLocaleServiceUrl(config.host));
	url.searchParams.set("repository", config.repo);
	return request(url, {
		method: "POST",
		json: {
			id: locale.id,
			isMaster: locale.isMaster ?? false,
			...(locale.customName ? { customName: locale.customName } : {}),
		},
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		schema: LocaleSchema,
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to save locale",
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => upsertLocale(locale, config)),
	});
}

export async function deleteLocale(code: string, config: RepositoryConfig): Promise<void> {
	const url = new URL(
		`repository/locales/${encodeURIComponent(code)}`,
		getLocaleServiceUrl(config.host),
	);
	url.searchParams.set("repository", config.repo);
	await request(url, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		notFoundMessage: `Locale not found: ${code}`,
		unknownErrorMessage: "Failed to remove locale",
		onAuthError: (error) => retryAfterLogin(error, config, (config) => deleteLocale(code, config)),
	});
}

function getLocaleServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/locale/`);
}

const PreviewSchema = z.object({
	id: z.string(),
	label: z.string(),
	url: z.string(),
});

export type Preview = z.infer<typeof PreviewSchema>;

export async function getPreviews(config: RepositoryConfig): Promise<{ results: Preview[] }> {
	const url = new URL(
		"core/repository/preview_configs",
		getRepositoryDomainUrl(config.repo, config.host),
	);
	return request(url, {
		credentials: { "prismic-auth": await config.getToken() },
		schema: z.object({ results: z.array(PreviewSchema) }),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to load previews",
		onAuthError: (error) => retryAfterLogin(error, config, getPreviews),
	});
}

export async function addPreview(
	previewConfig: {
		name: string;
		websiteURL: string;
		resolverPath: string | undefined;
	},
	config: RepositoryConfig,
): Promise<void> {
	const url = new URL("previews/new", getRepositoryDomainUrl(config.repo, config.host));
	await request(url, {
		method: "POST",
		json: {
			name: previewConfig.name,
			websiteURL: previewConfig.websiteURL,
			resolverPath: previewConfig.resolverPath,
		},
		credentials: { "prismic-auth": await config.getToken() },
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to add preview",
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => addPreview(previewConfig, config)),
	});
}

export async function deletePreview(id: string, config: RepositoryConfig): Promise<void> {
	const url = new URL(
		`previews/delete/${encodeURIComponent(id)}`,
		getRepositoryDomainUrl(config.repo, config.host),
	);
	await request(url, {
		method: "POST",
		json: {},
		credentials: { "prismic-auth": await config.getToken() },
		notFoundMessage: `Preview not found: ${id}`,
		unknownErrorMessage: "Failed to remove preview",
		onAuthError: (error) => retryAfterLogin(error, config, (config) => deletePreview(id, config)),
	});
}

const EnvironmentSchema = z.object({
	kind: z.enum(["prod", "stage", "dev"]),
	name: z.string(),
	domain: z.string(),
	users: z.array(z.object({ id: z.string() })),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

export async function getEnvironments(
	config: RepositoryConfig,
): Promise<{ results: Environment[] }> {
	const url = new URL("core/environments", getRepositoryDomainUrl(config.repo, config.host));
	return request(url, {
		credentials: { "prismic-auth": await config.getToken() },
		schema: z.object({ results: z.array(EnvironmentSchema) }),
		notFoundMessage: `Repository not found: ${config.repo}`,
		onAuthError: (error) => retryAfterLogin(error, config, getEnvironments),
	});
}

export async function getSimulatorUrl(
	config: RepositoryConfig,
): Promise<{ simulator_url?: string }> {
	const url = new URL("core/repository", getRepositoryDomainUrl(config.repo, config.host));
	return request(url, {
		credentials: { "prismic-auth": await config.getToken() },
		schema: z.object({ simulator_url: z.optional(z.string()) }),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to load simulator URL",
		onAuthError: (error) => retryAfterLogin(error, config, getSimulatorUrl),
	});
}

export async function setSimulatorUrl(
	simulatorUrl: string,
	config: RepositoryConfig,
): Promise<void> {
	const url = new URL("core/repository", getRepositoryDomainUrl(config.repo, config.host));
	await request(url, {
		method: "PATCH",
		json: { simulator_url: simulatorUrl },
		credentials: { "prismic-auth": await config.getToken() },
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to set simulator URL",
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => setSimulatorUrl(simulatorUrl, config)),
	});
}

export async function getDocumentTotalByCustomType(
	customTypeId: string,
	config: RepositoryConfig,
): Promise<{ total: number }> {
	const url = new URL("core/documents/search", getRepositoryDomainUrl(config.repo, config.host));
	return request(url, {
		method: "POST",
		json: { customTypes: [customTypeId], limit: 0 },
		credentials: { "prismic-auth": await config.getToken() },
		schema: z.object({ total: z.number() }),
		notFoundMessage: `Repository not found: ${config.repo}`,
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) =>
				getDocumentTotalByCustomType(customTypeId, config),
			),
	});
}

export async function createRelease(
	release: { label: string; hidden?: boolean },
	config: RepositoryConfig,
): Promise<{ id: string }> {
	const url = new URL("core/releases", getRepositoryDomainUrl(config.repo, config.host));
	return request(url, {
		method: "POST",
		json: release,
		credentials: { "prismic-auth": await config.getToken() },
		schema: z.looseObject({ id: z.string() }),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to create a release",
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => createRelease(release, config)),
	});
}

export async function deleteRelease(id: string, config: RepositoryConfig): Promise<void> {
	const url = new URL(
		`core/releases/${encodeURIComponent(id)}`,
		getRepositoryDomainUrl(config.repo, config.host),
	);
	await request(url, {
		method: "DELETE",
		credentials: { "prismic-auth": await config.getToken() },
		notFoundMessage: `Release not found: ${id}`,
		unknownErrorMessage: "Failed to delete the release",
		onAuthError: (error) => retryAfterLogin(error, config, (config) => deleteRelease(id, config)),
	});
}

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

export async function getWebhooks(config: RepositoryConfig): Promise<Webhook[]> {
	const url = new URL("app/settings/webhooks", getRepositoryDomainUrl(config.repo, config.host));
	return request(url, {
		credentials: { "prismic-auth": await config.getToken() },
		schema: z.array(WebhookSchema),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to load webhooks",
		onAuthError: (error) => retryAfterLogin(error, config, getWebhooks),
	});
}

export async function createWebhook(
	webhookConfig: Omit<Webhook["config"], "_id" | "active" | "headers">,
	config: RepositoryConfig,
): Promise<void> {
	const body = toWebhookFormData({ ...webhookConfig, active: true, headers: {} });
	const url = new URL(
		"app/settings/webhooks/create",
		getRepositoryDomainUrl(config.repo, config.host),
	);
	await request(url, {
		method: "POST",
		body,
		credentials: { "prismic-auth": await config.getToken() },
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to create webhook",
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => createWebhook(webhookConfig, config)),
	});
}

export async function updateWebhook(
	id: string,
	webhookConfig: Omit<Webhook["config"], "_id">,
	config: RepositoryConfig,
): Promise<void> {
	const body = toWebhookFormData(webhookConfig);
	const url = new URL(
		`app/settings/webhooks/${encodeURIComponent(id)}`,
		getRepositoryDomainUrl(config.repo, config.host),
	);
	await request(url, {
		method: "POST",
		body,
		credentials: { "prismic-auth": await config.getToken() },
		notFoundMessage: `Webhook not found: ${id}`,
		unknownErrorMessage: "Failed to update webhook",
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => updateWebhook(id, webhookConfig, config)),
	});
}

export async function deleteWebhook(id: string, config: RepositoryConfig): Promise<void> {
	const url = new URL(
		`app/settings/webhooks/${encodeURIComponent(id)}/delete`,
		getRepositoryDomainUrl(config.repo, config.host),
	);
	await request(url, {
		method: "POST",
		credentials: { "prismic-auth": await config.getToken() },
		notFoundMessage: `Webhook not found: ${id}`,
		unknownErrorMessage: "Failed to delete webhook",
		onAuthError: (error) => retryAfterLogin(error, config, (config) => deleteWebhook(id, config)),
	});
}

function toWebhookFormData(webhookConfig: Omit<Webhook["config"], "_id">): FormData {
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

export async function getOAuthApps(config: RepositoryConfig): Promise<OAuthApp[]> {
	const url = new URL(
		"settings/security/contentapi",
		getRepositoryDomainUrl(config.repo, config.host),
	);
	return request(url, {
		credentials: { "prismic-auth": await config.getToken() },
		schema: z.array(OAuthAppSchema),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to load OAuth apps",
		onAuthError: (error) => retryAfterLogin(error, config, getOAuthApps),
	});
}

export async function createOAuthApp(name: string, config: RepositoryConfig): Promise<OAuthApp> {
	const url = new URL(
		"settings/security/oauthapp",
		getRepositoryDomainUrl(config.repo, config.host),
	);
	return request(url, {
		method: "POST",
		json: { app_name: name },
		credentials: { "prismic-auth": await config.getToken() },
		schema: OAuthAppSchema,
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to create OAuth app",
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => createOAuthApp(name, config)),
	});
}

export async function createOAuthAuthorization(
	appId: string,
	scope: string,
	config: RepositoryConfig,
): Promise<AccessToken> {
	const url = new URL(
		"settings/security/authorizations",
		getRepositoryDomainUrl(config.repo, config.host),
	);
	return request(url, {
		method: "POST",
		json: { app: appId, scope },
		credentials: { "prismic-auth": await config.getToken() },
		schema: AccessTokenSchema,
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to create token",
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => createOAuthAuthorization(appId, scope, config)),
	});
}

export async function deleteOAuthAuthorization(
	authId: string,
	config: RepositoryConfig,
): Promise<void> {
	const url = new URL(
		`settings/security/authorizations/${encodeURIComponent(authId)}`,
		getRepositoryDomainUrl(config.repo, config.host),
	);
	await request(url, {
		method: "DELETE",
		credentials: { "prismic-auth": await config.getToken() },
		notFoundMessage: `Token not found: ${authId}`,
		unknownErrorMessage: "Failed to delete token",
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => deleteOAuthAuthorization(authId, config)),
	});
}

export async function getWriteTokens(config: RepositoryConfig): Promise<WriteTokensInfo> {
	const url = new URL(
		"settings/security/customtypesapi",
		getRepositoryDomainUrl(config.repo, config.host),
	);
	return request(url, {
		credentials: { "prismic-auth": await config.getToken() },
		schema: WriteTokensInfoSchema,
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to load write tokens",
		onAuthError: (error) => retryAfterLogin(error, config, getWriteTokens),
	});
}

export async function createWriteToken(
	name: string,
	config: RepositoryConfig,
): Promise<WriteToken> {
	const url = new URL("settings/security/token", getRepositoryDomainUrl(config.repo, config.host));
	return request(url, {
		method: "POST",
		json: { app_name: name },
		credentials: { "prismic-auth": await config.getToken() },
		schema: WriteTokenSchema,
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to create write token",
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => createWriteToken(name, config)),
	});
}

export async function deleteWriteToken(
	tokenValue: string,
	config: RepositoryConfig,
): Promise<void> {
	const url = new URL(
		`settings/security/token/${encodeURIComponent(tokenValue)}`,
		getRepositoryDomainUrl(config.repo, config.host),
	);
	await request(url, {
		method: "DELETE",
		credentials: { "prismic-auth": await config.getToken() },
		notFoundMessage: "Token not found",
		unknownErrorMessage: "Failed to delete write token",
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => deleteWriteToken(tokenValue, config)),
	});
}

export async function getRepositoryApiAccess(
	config: RepositoryConfig,
): Promise<{ repository: { api_access: string } }> {
	const url = new URL("syncState", getRepositoryDomainUrl(config.repo, config.host));
	return request(url, {
		credentials: { "prismic-auth": await config.getToken() },
		schema: z.object({ repository: z.object({ api_access: z.string() }) }),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to load repository access",
		onAuthError: (error) => retryAfterLogin(error, config, getRepositoryApiAccess),
	});
}

export type RepositoryApiAccessLevel = "private" | "public" | "open";

export async function setRepositoryApiAccess(
	level: RepositoryApiAccessLevel,
	config: RepositoryConfig,
): Promise<void> {
	const url = new URL(
		"settings/security/apiaccess",
		getRepositoryDomainUrl(config.repo, config.host),
	);
	await request(url, {
		method: "POST",
		json: { api_access: level },
		credentials: { "prismic-auth": await config.getToken() },
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to set repository access",
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => setRepositoryApiAccess(level, config)),
	});
}

export async function setRepositoryName(
	name: string,
	config: RepositoryConfig,
): Promise<{ repository: { name: string } }> {
	const formData = new FormData();
	formData.set("displayname", name);
	const url = new URL("app/settings/repository", getRepositoryDomainUrl(config.repo, config.host));
	return request(url, {
		method: "POST",
		body: formData,
		credentials: { "prismic-auth": await config.getToken() },
		schema: z.object({ repository: z.object({ name: z.string() }) }),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to set repository name",
		onAuthError: (error) =>
			retryAfterLogin(error, config, (config) => setRepositoryName(name, config)),
	});
}

function getRepositoryDomainUrl(repo: string, host: string): URL {
	return new URL(`https://${repo}.${host}/`);
}

export async function checkIsDomainAvailable(
	config: Credentials & { domain: string },
): Promise<boolean> {
	const url = new URL(
		`app/dashboard/repositories/${encodeURIComponent(config.domain)}/exists`,
		getDashboardUrl(config.host),
	);
	return request(url, {
		credentials: { "prismic-auth": await config.getToken() },
		schema: z.boolean(),
		onAuthError: (error) => retryAfterLogin(error, config, checkIsDomainAvailable),
	});
}

export async function createRepository(
	config: Credentials & {
		domain: string;
		name: string;
		framework: string;
		agent: string | undefined;
	},
): Promise<void> {
	const { domain, name, framework, agent, host } = config;
	const url = new URL("app/dashboard/repositories", getDashboardUrl(host));
	url.searchParams.set("app", "cli");
	if (agent) url.searchParams.set("agent", agent);
	await request(url, {
		method: "POST",
		json: { domain, name, framework, plan: "personal" },
		credentials: { "prismic-auth": await config.getToken() },
		unknownErrorMessage: "Failed to create repository",
		onAuthError: (error) => retryAfterLogin(error, config, createRepository),
	});
}

function getDashboardUrl(host: string): URL {
	return new URL(`https://${host}/`);
}

// Documentation is only published at prismic.io; the host option exists for
// overrides only.
const DEFAULT_DOCS_HOST = "prismic.io";

type DocsConfig = { host?: string; headers?: Record<string, string> };

const DocsIndexEntrySchema = z.object({
	path: z.string(),
	title: z.string(),
	description: z.optional(z.string()),
});
type DocsIndexEntry = z.infer<typeof DocsIndexEntrySchema>;

const DocsPageSchema = z.object({
	path: z.string(),
	title: z.string(),
	description: z.optional(z.string()),
	anchors: z.array(
		z.object({
			slug: z.string(),
			excerpt: z.string(),
		}),
	),
});
type DocsPage = z.infer<typeof DocsPageSchema>;

export async function getDocsIndex(config: DocsConfig): Promise<DocsIndexEntry[]> {
	const url = new URL("api/index/", getDocsUrl(config.host));
	return request(url, {
		schema: z.array(DocsIndexEntrySchema),
		unknownErrorMessage: "Failed to fetch documentation index",
	});
}

export async function getDocsPageIndex(path: string, config: DocsConfig): Promise<DocsPage> {
	const url = new URL(`api/index/${path}`, getDocsUrl(config.host));
	return request(url, {
		schema: DocsPageSchema,
		notFoundMessage: `Documentation page not found: ${path}`,
		unknownErrorMessage: "Failed to fetch documentation index",
	});
}

export async function getDocsPageContent(path: string, config: DocsConfig): Promise<string> {
	const url = new URL(path, getDocsUrl(config.host));
	return request(url, {
		headers: { Accept: "text/markdown", ...config.headers },
		schema: z.string(),
		notFoundMessage: `Page not found: ${path}`,
		unknownErrorMessage: "Failed to fetch documentation page",
	});
}

function getDocsUrl(host = DEFAULT_DOCS_HOST): URL {
	return new URL(`https://${host}/docs/`);
}

async function retryAfterLogin<C extends Credentials, T>(
	error: RequestError,
	config: C,
	retry: (config: C) => Promise<T>,
): Promise<T> {
	// Most services answer an invalid token with a 403. A 403 with a valid
	// token means no access, and a new login would not help.
	if (error instanceof ForbiddenRequestError && (await hasValidToken(config))) throw error;
	const token = await config.getToken({ login: true });
	if (!token) throw error;
	return retry({ ...config, getToken: tokenWithoutLogin(token) });
}

function tokenWithoutLogin(token: string): Credentials["getToken"] {
	return async ({ login } = {}) => (login ? undefined : token);
}
