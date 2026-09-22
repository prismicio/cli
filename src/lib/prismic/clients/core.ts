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
export type Preview = z.infer<typeof PreviewSchema>;

export async function getPreviews(config: CoreConfig): Promise<Preview[]> {
	const response = await coreRequest("core/repository/preview_configs", config, {
		schema: z.object({ results: z.array(PreviewSchema) }),
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
	const { name, websiteURL, resolverPath } = previewConfig;
	await coreRequest("previews/new", config, {
		method: "POST",
		json: { name, websiteURL, resolverPath },
		unknownErrorMessage: "Failed to add preview",
	});
}

export async function removePreview(id: string, config: CoreConfig): Promise<void> {
	await coreRequest(`previews/delete/${encodeURIComponent(id)}`, config, {
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

export async function getEnvironments(config: CoreConfig): Promise<Environment[]> {
	const response = await coreRequest("core/environments", config, {
		schema: z.object({ results: z.array(EnvironmentSchema) }),
	});
	return response.results;
}

export async function getSimulatorUrl(config: CoreConfig): Promise<string | undefined> {
	const response = await coreRequest("core/repository", config, {
		schema: z.object({ simulator_url: z.optional(z.string()) }),
		unknownErrorMessage: "Failed to load simulator URL",
	});
	return response.simulator_url;
}

export async function setSimulatorUrl(simulatorUrl: string, config: CoreConfig): Promise<void> {
	await coreRequest("core/repository", config, {
		method: "PATCH",
		json: { simulator_url: simulatorUrl },
		unknownErrorMessage: "Failed to set simulator URL",
	});
}

export async function getDocumentTotalByCustomTypes(
	customTypeId: string,
	config: CoreConfig,
): Promise<number> {
	const response = await coreRequest("core/documents/search", config, {
		method: "POST",
		json: { customTypes: [customTypeId], limit: 0 },
		schema: z.object({ total: z.number() }),
	});
	return response.total;
}

async function coreRequest<T>(
	path: string,
	config: CoreConfig,
	options: RequestOptions<T>,
): Promise<T> {
	return request(new URL(path, `https://${config.repo}.${config.host}/`), {
		credentials: { "prismic-auth": config.token },
		notFoundMessage: `Repository not found: ${config.repo}`,
		...options,
	});
}
