import * as z from "zod/mini";

import { request, RequestError, type RequestOptions } from "../../request";

type ReleasesConfig = {
	repo: string;
	token: string | undefined;
	host: string;
};

const RELEASE_ERROR_CODES = [
	"NOT_ADMIN",
	"FEATURE_DISABLED",
	"LEGACY_REPOSITORY",
	"RELEASE_NOT_FOUND",
	"REPEATABLE_MISMATCH",
] as const;
export type ReleaseErrorCode = (typeof RELEASE_ERROR_CODES)[number];

export async function createHiddenRelease(label: string, config: ReleasesConfig): Promise<string> {
	const url = new URL("core/releases", getCoreServiceUrl(config.repo, config.host));
	const response = await releasesServiceRequest(url, config, {
		method: "POST",
		json: { label, hidden: true },
		schema: z.looseObject({ id: z.string() }),
		unknownErrorMessage: "Failed to create a release",
	});
	return response.id;
}

export async function deleteRelease(id: string, config: ReleasesConfig): Promise<void> {
	const url = new URL(
		`core/releases/${encodeURIComponent(id)}`,
		getCoreServiceUrl(config.repo, config.host),
	);
	await releasesServiceRequest(url, config, {
		method: "DELETE",
		unknownErrorMessage: "Failed to delete the release",
	});
}

// Release endpoints name the failure with an error code somewhere in the
// response body.
export function getReleaseErrorCode(error: unknown): ReleaseErrorCode | undefined {
	if (!(error instanceof RequestError)) return;
	const body = JSON.stringify(error.body) ?? "";
	return RELEASE_ERROR_CODES.find((code) => body.includes(code));
}

function releasesServiceRequest<T>(
	url: URL,
	config: ReleasesConfig,
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
