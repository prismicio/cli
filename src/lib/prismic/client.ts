import { createHash } from "node:crypto";

import type { DynamicCustomTypeModel, SharedSliceModel } from "@prismicio/types-internal";
import * as z from "zod/mini";

import { BadRequestError, request, UnknownRequestError, type RequestOptions } from "../request";
import { appendTrailingSlash, isSubdomain } from "../url";

type Config = {
	getToken: () => Promise<string | undefined>;
	host: string;
	onUnauthorized?: RequestOptions["onUnauthorized"];
};

type RepositoryConfig = Config & { repo: string };

const SessionSchema = z.union([
	z.object({ type: z.literal("USER"), email: z.string(), shortId: z.string() }),
	z.object({ type: z.literal("Machine2Machine"), domain: z.string(), appName: z.string() }),
]);

export async function validateToken(
	token: string | undefined,
	config: { host: string },
): Promise<z.infer<typeof SessionSchema>> {
	const url = new URL("validate", getAuthServiceUrl(config.host));
	return request(url, {
		headers: token ? { Authorization: `Bearer ${token}` } : undefined,
		schema: SessionSchema,
	});
}

function getAuthServiceUrl(host: string): URL {
	return new URL(`https://auth.${host}/`);
}

const GuestSchema = z.object({
	access_token: z.string(),
	refresh_token: z.string(),
	expires_in: z.number(),
	client_id: z.string(),
	claim_url: z.string(),
	disables_at: z.string(),
	deletes_at: z.string(),
});

export async function createGuest(config: { apiUrl: URL }): Promise<z.infer<typeof GuestSchema>> {
	const url = new URL("authentication/guest", config.apiUrl);
	return request(url, {
		method: "POST",
		// The caller holds the credentials lock, which other commands wait on.
		signal: AbortSignal.timeout(10_000),
		schema: GuestSchema,
		unknownErrorMessage: "Failed to start a guest account",
	});
}

export async function createGuestLink(
	config: Omit<Config, "host"> & { apiUrl: URL; redirectUri: string },
): Promise<{ url: string }> {
	const url = new URL("authentication/guest/magic-link", config.apiUrl);
	return request(url, {
		method: "POST",
		json: { redirect_uri: config.redirectUri },
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: z.object({ url: z.string() }),
		unknownErrorMessage: "Failed to create a login link",
	});
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

export async function getUserProfile(config: Config): Promise<Profile> {
	const url = new URL("user/profile", getUserServiceUrl(config.host));
	return request(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: ProfileSchema,
		unknownErrorMessage: "Failed to load your profile",
	});
}

export async function isGuestClaimed(config: { token: string; apiUrl: URL }): Promise<boolean> {
	const url = new URL("user/profile", config.apiUrl);
	const profile = await request(url, {
		headers: { Authorization: `Bearer ${config.token}` },
		schema: z.object({ guest: z.optional(z.object({ status: z.string() })) }),
	});
	return profile.guest?.status === "claimed";
}

export async function getUserRepositories(
	config: Config,
): Promise<{ repositories: z.infer<typeof UserRepositorySchema>[] }> {
	const url = new URL("user/repositories", getUserServiceUrl(config.host));
	return request(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: z.object({ repositories: z.array(UserRepositorySchema) }),
		unknownErrorMessage: "Failed to load your repositories",
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
		headers: await getRepositoryHeaders(config),
		onUnauthorized: config.onUnauthorized,
		schema: RepositorySchema,
		notFoundMessage: `Repository not found: ${config.repo}`,
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
		headers: await getRepositoryHeaders(config),
		onUnauthorized: config.onUnauthorized,
		notFoundMessage: `Repository not found: ${config.repo}`,
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
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
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
	url.searchParams.set("repository", config.repo);
	return request(url, {
		method: "PATCH",
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: OnboardingStateSchema,
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
		headers: await getRepositoryHeaders(config),
		onUnauthorized: config.onUnauthorized,
		notFoundMessage: `Repository not found: ${config.repo}`,
	});
}

export async function getSlices(config: CustomTypesConfig): Promise<SharedSliceModel[]> {
	const url = new URL("slices", getCustomTypesServiceUrl(config.host));
	if (config.releaseId) url.searchParams.set("release", config.releaseId);
	return request<SharedSliceModel[]>(url, {
		headers: await getRepositoryHeaders(config),
		onUnauthorized: config.onUnauthorized,
		notFoundMessage: `Repository not found: ${config.repo}`,
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
		headers: await getRepositoryHeaders(config),
		onUnauthorized: config.onUnauthorized,
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to update models",
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
		headers: await getRepositoryHeaders(config),
		onUnauthorized: config.onUnauthorized,
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
		headers: await getRepositoryHeaders(config),
		onUnauthorized: config.onUnauthorized,
		schema: ScreenshotPresignedUrlResponseSchema,
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
		onUnauthorized: config.onUnauthorized,
		schema: z.object({ results: z.array(LocaleSchema) }),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to load locales",
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
		onUnauthorized: config.onUnauthorized,
		schema: LocaleSchema,
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to save locale",
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
		onUnauthorized: config.onUnauthorized,
		notFoundMessage: `Locale not found: ${code}`,
		unknownErrorMessage: "Failed to remove locale",
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
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: z.object({ results: z.array(PreviewSchema) }),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to load previews",
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
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to add preview",
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
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
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

export async function getEnvironments(
	config: RepositoryConfig,
): Promise<{ results: Environment[] }> {
	const url = new URL("core/environments", getRepositoryDomainUrl(config.repo, config.host));
	return request(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: z.object({ results: z.array(EnvironmentSchema) }),
		notFoundMessage: `Repository not found: ${config.repo}`,
	});
}

export async function getSimulatorUrl(
	config: RepositoryConfig,
): Promise<{ simulator_url?: string }> {
	const url = new URL("core/repository", getRepositoryDomainUrl(config.repo, config.host));
	return request(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: z.object({ simulator_url: z.optional(z.string()) }),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to load simulator URL",
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
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to set simulator URL",
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
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: z.object({ total: z.number() }),
		notFoundMessage: `Repository not found: ${config.repo}`,
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
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: z.looseObject({ id: z.string() }),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to create a release",
	});
}

export async function deleteRelease(id: string, config: RepositoryConfig): Promise<void> {
	const url = new URL(
		`core/releases/${encodeURIComponent(id)}`,
		getRepositoryDomainUrl(config.repo, config.host),
	);
	await request(url, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
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

export async function getWebhooks(config: RepositoryConfig): Promise<Webhook[]> {
	const url = new URL("app/settings/webhooks", getRepositoryDomainUrl(config.repo, config.host));
	return request(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: z.array(WebhookSchema),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to load webhooks",
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
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		notFoundMessage: `Repository not found: ${config.repo}`,
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
		getRepositoryDomainUrl(config.repo, config.host),
	);
	await request(url, {
		method: "POST",
		body,
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		notFoundMessage: `Webhook not found: ${id}`,
		unknownErrorMessage: "Failed to update webhook",
	});
}

export async function deleteWebhook(id: string, config: RepositoryConfig): Promise<void> {
	const url = new URL(
		`app/settings/webhooks/${encodeURIComponent(id)}/delete`,
		getRepositoryDomainUrl(config.repo, config.host),
	);
	await request(url, {
		method: "POST",
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
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

export async function getOAuthApps(config: RepositoryConfig): Promise<OAuthApp[]> {
	const url = new URL(
		"settings/security/contentapi",
		getRepositoryDomainUrl(config.repo, config.host),
	);
	return request(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: z.array(OAuthAppSchema),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to load OAuth apps",
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
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: OAuthAppSchema,
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to create OAuth app",
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
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: AccessTokenSchema,
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to create token",
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
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		notFoundMessage: `Token not found: ${authId}`,
		unknownErrorMessage: "Failed to delete token",
	});
}

export async function getWriteTokens(config: RepositoryConfig): Promise<WriteTokensInfo> {
	const url = new URL(
		"settings/security/customtypesapi",
		getRepositoryDomainUrl(config.repo, config.host),
	);
	return request(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: WriteTokensInfoSchema,
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to load write tokens",
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
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: WriteTokenSchema,
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to create write token",
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
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		notFoundMessage: "Token not found",
		unknownErrorMessage: "Failed to delete write token",
	});
}

export async function getRepositoryApiAccess(
	config: RepositoryConfig,
): Promise<{ repository: { api_access: string } }> {
	const url = new URL("syncState", getRepositoryDomainUrl(config.repo, config.host));
	return request(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: z.object({ repository: z.object({ api_access: z.string() }) }),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to load repository access",
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
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to set repository access",
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
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: z.object({ repository: z.object({ name: z.string() }) }),
		notFoundMessage: `Repository not found: ${config.repo}`,
		unknownErrorMessage: "Failed to set repository name",
	});
}

function getRepositoryDomainUrl(repo: string, host: string): URL {
	return new URL(`https://${getRepositoryDomain(repo)}.${host}/`);
}

async function getRepositoryHeaders(config: RepositoryConfig): Promise<Record<string, string>> {
	const repository = getRepositoryDomain(config.repo);
	return { Authorization: `Bearer ${await config.getToken()}`, repository };
}

// A value that isn't a subdomain, such as a list of names, can't go in a URL
// or a header.
function getRepositoryDomain(repo: string): string {
	if (!isSubdomain(repo)) throw new InvalidRepositoryDomainError(repo);
	return repo;
}

export class InvalidRepositoryDomainError extends Error {
	name = "InvalidRepositoryDomainError";

	constructor(repo: string) {
		super(
			`Check your repository domain: ${JSON.stringify(repo)}. Pass one repository domain per command, such as "my-repo".`,
		);
	}
}

export async function checkIsDomainAvailable(
	config: Config & { domain: string },
): Promise<boolean> {
	const url = new URL(
		`app/dashboard/repositories/${encodeURIComponent(config.domain)}/exists`,
		getDashboardUrl(config.host),
	);
	return request(url, {
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		schema: z.boolean(),
	});
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
	await request(url, {
		method: "POST",
		json: { domain, name, framework, plan: "personal" },
		headers: { Authorization: `Bearer ${await config.getToken()}` },
		onUnauthorized: config.onUnauthorized,
		unknownErrorMessage: "Failed to create repository",
	});
}

function getDashboardUrl(host: string): URL {
	return new URL(`https://${host}/`);
}

const McpToolSchema = z.looseObject({
	name: z.string(),
	description: z.optional(z.string()),
	inputSchema: z.unknown(),
	_meta: z.optional(
		z.object({ ui: z.optional(z.object({ visibility: z.optional(z.array(z.string())) })) }),
	),
});
type McpTool = z.infer<typeof McpToolSchema>;

const McpToolResultSchema = z.object({
	content: z.array(z.looseObject({ type: z.string(), text: z.optional(z.string()) })),
	isError: z.optional(z.boolean()),
});
type McpToolResult = z.infer<typeof McpToolResultSchema>;

export async function getMcpTools(config: Config): Promise<McpTool[]> {
	const { tools } = await requestMcp(
		"tools/list",
		{},
		z.object({ tools: z.array(McpToolSchema) }),
		config,
	);
	return tools;
}

export async function callMcpTool(
	name: string,
	args: unknown,
	config: Config,
): Promise<McpToolResult> {
	return requestMcp("tools/call", { name, arguments: args }, McpToolResultSchema, config);
}

const McpMessageSchema = z.object({
	// JSON-RPC error responses have no result.
	result: z.optional(z.unknown()),
	error: z.optional(z.object({ message: z.string() })),
});

async function requestMcp<T>(
	method: string,
	params: unknown,
	schema: z.ZodMiniType<T>,
	config: Config,
): Promise<T> {
	const message = await request(getMcpServiceUrl(config.host), {
		method: "POST",
		json: { jsonrpc: "2.0", id: 1, method, params },
		headers: {
			Authorization: `Bearer ${await config.getToken()}`,
			// The MCP server rejects requests that don't accept both.
			Accept: "application/json, text/event-stream",
		},
		onUnauthorized: config.onUnauthorized,
		schema: McpMessageSchema,
	}).catch((error) => {
		if (error instanceof BadRequestError || error instanceof UnknownRequestError) {
			const body = z.safeParse(McpMessageSchema, error.body);
			if (body.data?.error) throw new McpError(body.data.error.message);
		}
		throw error;
	});
	if (message.error) throw new McpError(message.error.message);
	return z.parse(schema, message.result);
}

export class McpError extends Error {
	name = "McpError";
}

function getMcpServiceUrl(host: string): URL {
	return new URL(`https://mcp.${host}/mcp`);
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
