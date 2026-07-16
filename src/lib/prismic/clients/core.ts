import * as z from "zod/mini";

import { request, type RequestOptions } from "../../request";

type CoreConfig = {
	repo: string;
	token: string | undefined;
	host: string;
};

const PreviewSchema = z.object({
	id: z.string(),
	label: z.string(),
	url: z.string(),
});

const GetPreviewsResponseSchema = z.object({
	results: z.array(PreviewSchema),
});

export type Preview = z.infer<typeof PreviewSchema>;

export async function getPreviews(config: CoreConfig): Promise<Preview[]> {
	const { repo, host } = config;
	const url = new URL("core/repository/preview_configs", getCoreServiceUrl(repo, host));
	const response = await coreServiceRequest(url, config, {
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
	config: CoreConfig,
): Promise<void> {
	const { repo, host } = config;
	const url = new URL("previews/new", getCoreServiceUrl(repo, host));
	await coreServiceRequest(url, config, {
		method: "POST",
		json: {
			name: previewConfig.name,
			websiteURL: previewConfig.websiteURL,
			resolverPath: previewConfig.resolverPath,
		},
		unknownErrorMessage: "Failed to add preview",
	});
}

export async function removePreview(id: string, config: CoreConfig): Promise<void> {
	const { repo, host } = config;
	const url = new URL(`previews/delete/${encodeURIComponent(id)}`, getCoreServiceUrl(repo, host));
	await coreServiceRequest(url, config, {
		method: "POST",
		json: {},
		notFoundMessage: "Preview not found",
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

export async function getEnvironments(config: CoreConfig): Promise<Environment[]> {
	const { repo, host } = config;
	const url = new URL("core/environments", getCoreServiceUrl(repo, host));
	const response = await coreServiceRequest(url, config, {
		schema: z.object({ results: z.array(EnvironmentSchema) }),
	});
	return response.results;
}

const RepositoryResponseSchema = z.object({
	simulator_url: z.optional(z.string()),
});

export async function getSimulatorUrl(config: CoreConfig): Promise<string | undefined> {
	const { repo, host } = config;
	const url = new URL("core/repository", getCoreServiceUrl(repo, host));
	const response = await coreServiceRequest(url, config, {
		schema: RepositoryResponseSchema,
		unknownErrorMessage: "Failed to load simulator URL",
	});
	return response.simulator_url;
}

export async function setSimulatorUrl(simulatorUrl: string, config: CoreConfig): Promise<void> {
	const { repo, host } = config;
	const url = new URL("core/repository", getCoreServiceUrl(repo, host));
	await coreServiceRequest(url, config, {
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
	config: CoreConfig,
): Promise<number> {
	const { repo, host } = config;
	const url = new URL("core/documents/search", getCoreServiceUrl(repo, host));
	const response = await coreServiceRequest(url, config, {
		method: "POST",
		json: { customTypes: [customTypeId], limit: 0 },
		schema: DocumentSearchTotalSchema,
	});
	return response.total;
}

function coreServiceRequest<T>(
	url: URL,
	config: CoreConfig,
	options: RequestOptions<T> = {},
): Promise<T> {
	return request(url, {
		credentials: { "prismic-auth": config.token },
		notFoundMessage: `Repository not found: ${config.repo}`,
		...options,
	});
}

function getCoreServiceUrl(repo: string, host: string): URL {
	return new URL(`https://${repo}.${host}/`);
}
