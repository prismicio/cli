import { createHash } from "node:crypto";

import type { DynamicCustomTypeModel, SharedSliceModel } from "@prismicio/types-internal";
import * as z from "zod/mini";

import { request, type RequestOptions } from "../request";
import { appendTrailingSlash } from "../url";

type Config = {
	token: string | undefined;
	host: string;
};

type RepositoryConfig = Config & { repo: string };

// Auth service

export async function refreshToken(token: string, config: { host: string }): Promise<string> {
	const url = new URL("refreshtoken", getAuthServiceUrl(config.host));
	url.searchParams.set("token", token);
	return request(url, { schema: z.string() });
}

const SessionSchema = z.union([
	z.object({ type: z.literal("USER"), email: z.string(), shortId: z.string() }),
	z.object({ type: z.literal("Machine2Machine"), domain: z.string(), appName: z.string() }),
]);

export async function validateToken(
	token: string | undefined,
	config: { host: string },
): Promise<z.infer<typeof SessionSchema>> {
	const url = new URL("validate", getAuthServiceUrl(config.host));
	if (token) url.searchParams.set("token", token);
	return request(url, { schema: SessionSchema });
}

function getAuthServiceUrl(host: string): URL {
	return new URL(`https://auth.${host}/`);
}

// User service

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

const UserRepositoryListSchema = z.object({
	repositories: z.array(UserRepositorySchema),
});

export async function getProfile(config: Config): Promise<Profile> {
	const url = new URL("user/profile", getUserServiceUrl(config.host));
	return bearerRequest(url, config, {
		schema: ProfileSchema,
		unknownErrorMessage: "Failed to load your profile",
	});
}

export async function getRepositories(
	config: Config,
): Promise<z.infer<typeof UserRepositorySchema>[]> {
	const url = new URL("user/repositories", getUserServiceUrl(config.host));
	const response = await bearerRequest(url, config, {
		schema: UserRepositoryListSchema,
		unknownErrorMessage: "Failed to load your repositories",
	});
	return response.repositories;
}

function getUserServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/`);
}

// Repository service

const RepositoryStarterSchema = z.object({
	id: z.string(),
	revision: z.string(),
	framework: z.string(),
	deploymentUrl: z.url(),
});

const RepositorySchema = z.object({
	name: z.optional(z.string()),
	starter: z.nullish(RepositoryStarterSchema),
	framework: z.optional(z.string()),
	quotas: z.optional(
		z.object({
			sliceMachineEnabled: z.boolean(),
		}),
	),
});

export type Repository = z.infer<typeof RepositorySchema>;

export function getRepository(config: RepositoryConfig): Promise<Repository> {
	const url = getRepositoryServiceUrl(config.host);
	return repositoryServiceRequest(url, config, { schema: RepositorySchema });
}

export async function enableTypeBuilder(
	framework: string,
	config: RepositoryConfig,
): Promise<void> {
	const url = new URL("type-builder", getRepositoryServiceUrl(config.host));
	await repositoryServiceRequest(url, config, { method: "PATCH", json: { framework } });
}

const OnboardingStateSchema = z.object({
	completedSteps: z.array(z.string()),
});
type OnboardingState = z.infer<typeof OnboardingStateSchema>;

export async function getOnboardingState(config: RepositoryConfig): Promise<OnboardingState> {
	const url = new URL("onboarding", getRepositoryServiceUrl(config.host));
	return onboardingServiceRequest(url, config, {
		schema: OnboardingStateSchema,
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
	return onboardingServiceRequest(url, config, {
		method: "PATCH",
		schema: OnboardingStateSchema,
	});
}

function repositoryServiceRequest<T>(
	url: URL,
	config: RepositoryConfig,
	options: PrismicRequestOptions<T> = {},
): Promise<T> {
	const scopedUrl = new URL(url);
	scopedUrl.searchParams.set("repository", config.repo);
	return bearerRequest(scopedUrl, config, {
		headers: { repository: config.repo },
		notFoundMessage: `Repository not found: ${config.repo}`,
		...options,
	});
}

function onboardingServiceRequest<T>(
	url: URL,
	config: RepositoryConfig,
	options: PrismicRequestOptions<T> = {},
): Promise<T> {
	const scopedUrl = new URL(url);
	scopedUrl.searchParams.set("repository", config.repo);
	return cookieRequest(scopedUrl, config, options);
}

function getRepositoryServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/repository/`);
}

// Custom types service

export type CustomTypesConfig = RepositoryConfig & { releaseId?: string };

export function getCustomTypes(config: CustomTypesConfig): Promise<DynamicCustomTypeModel[]> {
	const url = new URL("customtypes", getCustomTypesServiceUrl(config.host));
	return customTypesServiceRequest<DynamicCustomTypeModel[]>(url, config);
}

export function getSlices(config: CustomTypesConfig): Promise<SharedSliceModel[]> {
	const url = new URL("slices", getCustomTypesServiceUrl(config.host));
	return customTypesServiceRequest<SharedSliceModel[]>(url, config);
}

export type BulkChange = {
	type: `${"CUSTOM_TYPE" | "SLICE"}_${"INSERT" | "UPDATE" | "DELETE"}`;
	id: string;
	payload: DynamicCustomTypeModel | SharedSliceModel | { id: string };
};

export async function bulkUpdate(changes: BulkChange[], config: CustomTypesConfig): Promise<void> {
	const url = new URL("bulk-update", getCustomTypesServiceUrl(config.host));
	await customTypesServiceRequest(url, config, {
		method: "POST",
		json: { changes },
		unknownErrorMessage: "Failed to update models",
	});
}

function customTypesServiceRequest<T>(
	url: URL,
	config: CustomTypesConfig,
	options: PrismicRequestOptions<T> = {},
): Promise<T> {
	if (config.releaseId) url.searchParams.set("release", config.releaseId);
	return bearerRequest(url, config, {
		headers: { repository: config.repo },
		notFoundMessage: `Repository not found: ${config.repo}`,
		...options,
	});
}

function getCustomTypesServiceUrl(host: string): URL {
	return new URL(`https://customtypes.${host}/`);
}

// Screenshot service

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

export async function deleteScreenshots(sliceId: string, config: RepositoryConfig): Promise<void> {
	const url = new URL("delete", getScreenshotServiceUrl(config.host));
	await screenshotServiceRequest(url, config, {
		method: "POST",
		json: { sliceId },
	});
}

export async function uploadScreenshot(
	blob: Blob,
	config: RepositoryConfig & { sliceId: string; variationId: string },
): Promise<URL> {
	const { sliceId, variationId, repo, host } = config;

	const type = blob.type;
	if (!(type in SUPPORTED_IMAGE_MIME_TYPES)) {
		throw new UnsupportedFileTypeError(type);
	}

	const presignedUrl = new URL("presigned-url", getScreenshotServiceUrl(host));
	const presigned = await screenshotServiceRequest(presignedUrl, config, {
		schema: ScreenshotPresignedUrlResponseSchema,
	});

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

export class UnsupportedFileTypeError extends Error {
	name = "UnsupportedFileTypeError";

	constructor(mimeType: string) {
		const supportedTypes = Object.keys(SUPPORTED_IMAGE_MIME_TYPES);
		super(
			`Unsupported file type: ${mimeType || "unknown"}. Supported: ${supportedTypes.join(", ")}`,
		);
	}
}

function screenshotServiceRequest<T>(
	url: URL,
	config: RepositoryConfig,
	options: PrismicRequestOptions<T> = {},
): Promise<T> {
	const scopedUrl = new URL(url);
	scopedUrl.searchParams.set("repository", config.repo);
	return bearerRequest(scopedUrl, config, {
		headers: { repository: config.repo },
		...options,
	});
}

function getScreenshotServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/screenshot/`);
}

// Locale service

const LocaleSchema = z.object({
	id: z.string(),
	label: z.string(),
	customName: z.nullable(z.string()),
	isMaster: z.boolean(),
});

export type Locale = z.infer<typeof LocaleSchema>;

export async function getLocales(config: RepositoryConfig): Promise<Locale[]> {
	const url = new URL("repository/locales", getLocaleServiceUrl(config.host));
	const response = await localeServiceRequest(url, config, {
		schema: z.object({ results: z.array(LocaleSchema) }),
		unknownErrorMessage: "Failed to load locales",
	});
	return response.results;
}

export async function upsertLocale(
	locale: { id: string; isMaster?: boolean; customName?: string },
	config: RepositoryConfig,
): Promise<Locale> {
	const url = new URL("repository/locales", getLocaleServiceUrl(config.host));
	return localeServiceRequest(url, config, {
		method: "POST",
		json: {
			id: locale.id,
			isMaster: locale.isMaster ?? false,
			...(locale.customName ? { customName: locale.customName } : {}),
		},
		schema: LocaleSchema,
		unknownErrorMessage: "Failed to save locale",
	});
}

export async function removeLocale(code: string, config: RepositoryConfig): Promise<void> {
	const url = new URL(
		`repository/locales/${encodeURIComponent(code)}`,
		getLocaleServiceUrl(config.host),
	);
	await localeServiceRequest(url, config, {
		method: "DELETE",
		notFoundMessage: `Locale not found: ${code}`,
		unknownErrorMessage: "Failed to remove locale",
	});
}

function localeServiceRequest<T>(
	url: URL,
	config: RepositoryConfig,
	options: PrismicRequestOptions<T> = {},
): Promise<T> {
	const scopedUrl = new URL(url);
	scopedUrl.searchParams.set("repository", config.repo);
	return bearerRequest(scopedUrl, config, {
		notFoundMessage: `Repository not found: ${config.repo}`,
		...options,
	});
}

function getLocaleServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/locale/`);
}

// Repository domain (Core and Wroom)

const PreviewSchema = z.object({
	id: z.string(),
	label: z.string(),
	url: z.string(),
});

const GetPreviewsResponseSchema = z.object({
	results: z.array(PreviewSchema),
});

export type Preview = z.infer<typeof PreviewSchema>;

export async function getPreviews(config: RepositoryConfig): Promise<Preview[]> {
	const url = new URL("core/repository/preview_configs", getRepositoryDomainUrl(config));
	const response = await repositoryDomainRequest(url, config, {
		schema: GetPreviewsResponseSchema,
		unknownErrorMessage: "Failed to load previews",
	});
	return response.results;
}

export async function addPreview(
	previewConfig: {
		name: string;
		websiteURL: string;
		resolverPath: string | undefined;
	},
	config: RepositoryConfig,
): Promise<void> {
	const url = new URL("previews/new", getRepositoryDomainUrl(config));
	await repositoryDomainRequest(url, config, {
		method: "POST",
		json: {
			name: previewConfig.name,
			websiteURL: previewConfig.websiteURL,
			resolverPath: previewConfig.resolverPath,
		},
		unknownErrorMessage: "Failed to add preview",
	});
}

export async function removePreview(id: string, config: RepositoryConfig): Promise<void> {
	const url = new URL(`previews/delete/${encodeURIComponent(id)}`, getRepositoryDomainUrl(config));
	await repositoryDomainRequest(url, config, {
		method: "POST",
		json: {},
		notFoundMessage: `Preview not found: ${id}`,
		unknownErrorMessage: "Failed to remove preview",
	});
}

const EnvironmentSchema = z.object({
	kind: z.enum(["prod", "stage", "dev"]),
	name: z.string(),
	domain: z.string(),
	users: z.array(z.object({ id: z.string() })),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

export async function getEnvironments(config: RepositoryConfig): Promise<Environment[]> {
	const url = new URL("core/environments", getRepositoryDomainUrl(config));
	const response = await repositoryDomainRequest(url, config, {
		schema: z.object({ results: z.array(EnvironmentSchema) }),
	});
	return response.results;
}

const SimulatorUrlResponseSchema = z.object({
	simulator_url: z.optional(z.string()),
});

export async function getSimulatorUrl(config: RepositoryConfig): Promise<string | undefined> {
	const url = new URL("core/repository", getRepositoryDomainUrl(config));
	const response = await repositoryDomainRequest(url, config, {
		schema: SimulatorUrlResponseSchema,
		unknownErrorMessage: "Failed to load simulator URL",
	});
	return response.simulator_url;
}

export async function setSimulatorUrl(
	simulatorUrl: string,
	config: RepositoryConfig,
): Promise<void> {
	const url = new URL("core/repository", getRepositoryDomainUrl(config));
	await repositoryDomainRequest(url, config, {
		method: "PATCH",
		json: { simulator_url: simulatorUrl },
		unknownErrorMessage: "Failed to set simulator URL",
	});
}

const DocumentSearchTotalSchema = z.object({
	total: z.number(),
});

export async function getDocumentTotalByCustomTypes(
	customTypeId: string,
	config: RepositoryConfig,
): Promise<number> {
	const url = new URL("core/documents/search", getRepositoryDomainUrl(config));
	const response = await repositoryDomainRequest(url, config, {
		method: "POST",
		json: { customTypes: [customTypeId], limit: 0 },
		schema: DocumentSearchTotalSchema,
	});
	return response.total;
}

export async function createRelease(
	release: { label: string; hidden?: boolean },
	config: RepositoryConfig,
): Promise<string> {
	const url = new URL("core/releases", getRepositoryDomainUrl(config));
	const response = await repositoryDomainRequest(url, config, {
		method: "POST",
		json: release,
		schema: z.looseObject({ id: z.string() }),
		unknownErrorMessage: "Failed to create a release",
	});
	return response.id;
}

export async function deleteRelease(id: string, config: RepositoryConfig): Promise<void> {
	const url = new URL(`core/releases/${encodeURIComponent(id)}`, getRepositoryDomainUrl(config));
	await repositoryDomainRequest(url, config, {
		method: "DELETE",
		notFoundMessage: `Release not found: ${id}`,
		unknownErrorMessage: "Failed to delete the release",
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

export function getWebhooks(config: RepositoryConfig): Promise<Webhook[]> {
	const url = new URL("app/settings/webhooks", getRepositoryDomainUrl(config));
	return repositoryDomainRequest(url, config, {
		schema: z.array(WebhookSchema),
		unknownErrorMessage: "Failed to load webhooks",
	});
}

export async function createWebhook(
	webhookConfig: Omit<Webhook["config"], "_id" | "active" | "headers">,
	config: RepositoryConfig,
): Promise<void> {
	const body = toWebhookFormData({ ...webhookConfig, active: true, headers: {} });
	const url = new URL("app/settings/webhooks/create", getRepositoryDomainUrl(config));
	await repositoryDomainRequest(url, config, {
		method: "POST",
		body,
		unknownErrorMessage: "Failed to create webhook",
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
		getRepositoryDomainUrl(config),
	);
	await repositoryDomainRequest(url, config, {
		method: "POST",
		body,
		notFoundMessage: `Webhook not found: ${id}`,
		unknownErrorMessage: "Failed to update webhook",
	});
}

export async function deleteWebhook(id: string, config: RepositoryConfig): Promise<void> {
	const url = new URL(
		`app/settings/webhooks/${encodeURIComponent(id)}/delete`,
		getRepositoryDomainUrl(config),
	);
	await repositoryDomainRequest(url, config, {
		method: "POST",
		notFoundMessage: `Webhook not found: ${id}`,
		unknownErrorMessage: "Failed to delete webhook",
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

export function getOAuthApps(config: RepositoryConfig): Promise<OAuthApp[]> {
	const url = new URL("settings/security/contentapi", getRepositoryDomainUrl(config));
	return repositoryDomainRequest(url, config, {
		schema: z.array(OAuthAppSchema),
		unknownErrorMessage: "Failed to load OAuth apps",
	});
}

export async function createOAuthApp(name: string, config: RepositoryConfig): Promise<OAuthApp> {
	const url = new URL("settings/security/oauthapp", getRepositoryDomainUrl(config));
	return repositoryDomainRequest(url, config, {
		method: "POST",
		json: { app_name: name },
		schema: OAuthAppSchema,
		unknownErrorMessage: "Failed to create OAuth app",
	});
}

export async function createOAuthAuthorization(
	appId: string,
	scope: string,
	config: RepositoryConfig,
): Promise<AccessToken> {
	const url = new URL("settings/security/authorizations", getRepositoryDomainUrl(config));
	return repositoryDomainRequest(url, config, {
		method: "POST",
		json: { app: appId, scope },
		schema: AccessTokenSchema,
		unknownErrorMessage: "Failed to create token",
	});
}

export async function deleteOAuthAuthorization(
	authId: string,
	config: RepositoryConfig,
): Promise<void> {
	const url = new URL(
		`settings/security/authorizations/${encodeURIComponent(authId)}`,
		getRepositoryDomainUrl(config),
	);
	await repositoryDomainRequest(url, config, {
		method: "DELETE",
		notFoundMessage: `Token not found: ${authId}`,
		unknownErrorMessage: "Failed to delete token",
	});
}

export function getWriteTokens(config: RepositoryConfig): Promise<WriteTokensInfo> {
	const url = new URL("settings/security/customtypesapi", getRepositoryDomainUrl(config));
	return repositoryDomainRequest(url, config, {
		schema: WriteTokensInfoSchema,
		unknownErrorMessage: "Failed to load write tokens",
	});
}

export async function createWriteToken(
	name: string,
	config: RepositoryConfig,
): Promise<WriteToken> {
	const url = new URL("settings/security/token", getRepositoryDomainUrl(config));
	return repositoryDomainRequest(url, config, {
		method: "POST",
		json: { app_name: name },
		schema: WriteTokenSchema,
		unknownErrorMessage: "Failed to create write token",
	});
}

export async function deleteWriteToken(
	tokenValue: string,
	config: RepositoryConfig,
): Promise<void> {
	const url = new URL(
		`settings/security/token/${encodeURIComponent(tokenValue)}`,
		getRepositoryDomainUrl(config),
	);
	await repositoryDomainRequest(url, config, {
		method: "DELETE",
		notFoundMessage: "Token not found",
		unknownErrorMessage: "Failed to delete write token",
	});
}

const SyncStateSchema = z.object({
	repository: z.object({
		api_access: z.string(),
	}),
});

export async function getRepositoryAccess(config: RepositoryConfig): Promise<string> {
	const url = new URL("syncState", getRepositoryDomainUrl(config));
	const response = await repositoryDomainRequest(url, config, {
		schema: SyncStateSchema,
		unknownErrorMessage: "Failed to load repository access",
	});
	return response.repository.api_access;
}

export type RepositoryAccessLevel = "private" | "public" | "open";

export async function setRepositoryAccess(
	level: RepositoryAccessLevel,
	config: RepositoryConfig,
): Promise<void> {
	const url = new URL("settings/security/apiaccess", getRepositoryDomainUrl(config));
	await repositoryDomainRequest(url, config, {
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

export async function setRepositoryName(name: string, config: RepositoryConfig): Promise<string> {
	const formData = new FormData();
	formData.set("displayname", name);
	const url = new URL("app/settings/repository", getRepositoryDomainUrl(config));
	const response = await repositoryDomainRequest(url, config, {
		method: "POST",
		body: formData,
		schema: SetNameResponseSchema,
		unknownErrorMessage: "Failed to set repository name",
	});
	return response.repository.name;
}

function repositoryDomainRequest<T>(
	url: URL,
	config: RepositoryConfig,
	options: PrismicRequestOptions<T> = {},
): Promise<T> {
	return cookieRequest(url, config, {
		notFoundMessage: `Repository not found: ${config.repo}`,
		...options,
	});
}

function getRepositoryDomainUrl(config: RepositoryConfig): URL {
	return new URL(`https://${config.repo}.${config.host}/`);
}

// Dashboard (Wroom)

export async function checkIsDomainAvailable(
	config: Config & { domain: string },
): Promise<boolean> {
	const url = new URL(
		`app/dashboard/repositories/${encodeURIComponent(config.domain)}/exists`,
		getDashboardUrl(config.host),
	);
	return cookieRequest(url, config, { schema: z.boolean() });
}

export async function createRepository(
	config: Config & {
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
	await cookieRequest(url, config, {
		method: "POST",
		json: { domain, name, framework, plan: "personal" },
		unknownErrorMessage: "Failed to create repository",
	});
}

function getDashboardUrl(host: string): URL {
	return new URL(`https://${host}/`);
}

// Documentation

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

// Authentication

type PrismicRequestOptions<T> = RequestOptions<T> & { headers?: Record<string, string> };

function bearerRequest<T>(
	url: URL,
	config: Config,
	options: PrismicRequestOptions<T> = {},
): Promise<T> {
	return request(url, {
		...options,
		headers: { ...options.headers, Authorization: `Bearer ${config.token}` },
	});
}

function cookieRequest<T>(
	url: URL,
	config: Config,
	options: PrismicRequestOptions<T> = {},
): Promise<T> {
	return request(url, { ...options, credentials: { "prismic-auth": config.token } });
}
