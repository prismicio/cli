import * as z from "zod/mini";

import { request, type RequestOptions } from "../../request";

export type WebsiteGeneratorConfig = {
	token: string | undefined;
	host: string;
};

const ProvisionInstantStartResponseSchema = z.object({
	repositoryId: z.string(),
	repositoryUrl: z.url(),
	redirectDocumentId: z.optional(z.string()),
});
export type ProvisionInstantStartResponse = z.infer<typeof ProvisionInstantStartResponseSchema>;

const InstantStartExportNotPreparedSchema = z.object({
	status: z.literal("not-prepared"),
});

const InstantStartExportReadySchema = z.object({
	status: z.literal("ready"),
	framework: z.literal("next"),
	preparedAt: z.string(),
	downloadUrl: z.url(),
});
export type InstantStartExportReady = z.infer<typeof InstantStartExportReadySchema>;

const InstantStartExportStatusSchema = z.union([
	InstantStartExportNotPreparedSchema,
	InstantStartExportReadySchema,
]);
export type InstantStartExportStatus = z.infer<typeof InstantStartExportStatusSchema>;

export function provisionInstantStart(
	config: WebsiteGeneratorConfig,
): Promise<ProvisionInstantStartResponse> {
	const url = new URL("instant-start", getWebsiteGeneratorServiceUrl(config.host));
	return websiteGeneratorRequest(url, config, {
		method: "POST",
		schema: ProvisionInstantStartResponseSchema,
		unknownErrorMessage: "Failed to create an Instant Start repository",
	});
}

export function getInstantStartExportStatus(
	repositoryId: string,
	config: WebsiteGeneratorConfig,
): Promise<InstantStartExportStatus> {
	const url = getInstantStartExportUrl(repositoryId, config.host);
	return websiteGeneratorRequest(url, config, {
		schema: InstantStartExportStatusSchema,
		notFoundMessage: `Repository not found: ${repositoryId}`,
		unknownErrorMessage: "Failed to check the Instant Start export",
	});
}

export function createInstantStartExport(
	repositoryId: string,
	config: WebsiteGeneratorConfig,
): Promise<InstantStartExportReady> {
	const url = getInstantStartExportUrl(repositoryId, config.host);
	return websiteGeneratorRequest(url, config, {
		method: "POST",
		json: { framework: "next", replace: false },
		schema: InstantStartExportReadySchema,
		notFoundMessage: `Repository not found: ${repositoryId}`,
		unknownErrorMessage: "Failed to create the Instant Start export",
	});
}

export async function getOrCreateInstantStartExport(
	repositoryId: string,
	config: WebsiteGeneratorConfig,
): Promise<InstantStartExportReady> {
	const status = await getInstantStartExportStatus(repositoryId, config);
	return status.status === "ready" ? status : createInstantStartExport(repositoryId, config);
}

function websiteGeneratorRequest<T>(
	url: URL,
	config: WebsiteGeneratorConfig,
	options: RequestOptions<T>,
): Promise<T> {
	return request(url, {
		headers: { Authorization: `Bearer ${config.token ?? ""}` },
		...options,
	});
}

function getInstantStartExportUrl(repositoryId: string, host: string): URL {
	return new URL(
		`instant-start/${encodeURIComponent(repositoryId)}/export`,
		getWebsiteGeneratorServiceUrl(host),
	);
}

function getWebsiteGeneratorServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/website-generator/`);
}
