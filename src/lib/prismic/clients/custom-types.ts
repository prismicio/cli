import { createHash } from "node:crypto";

import type { DynamicCustomTypeModel, SharedSliceModel } from "@prismicio/types-internal";
import * as z from "zod/mini";

import { request, type RequestOptions } from "../../request";
import { appendTrailingSlash } from "../../url";

export type CustomTypesConfig = {
	repo: string;
	token: string | undefined;
	host: string;
	releaseId?: string;
};

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

export async function deleteScreenshots(sliceId: string, config: CustomTypesConfig): Promise<void> {
	const url = new URL("delete", getScreenshotServiceUrl(config.host));
	await screenshotServiceRequest(url, config, {
		method: "POST",
		json: { sliceId },
	});
}

export async function uploadScreenshot(
	blob: Blob,
	config: {
		sliceId: string;
		variationId: string;
		repo: string;
		token: string | undefined;
		host: string;
	},
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

function customTypesServiceRequest<T>(
	url: URL,
	config: CustomTypesConfig,
	options: RequestOptions<T> = {},
): Promise<T> {
	const scopedUrl = new URL(url);
	if (config.releaseId) scopedUrl.searchParams.set("release", config.releaseId);
	return request(scopedUrl, {
		headers: {
			repository: config.repo,
			Authorization: `Bearer ${config.token}`,
		},
		notFoundMessage: `Repository not found: ${config.repo}`,
		...options,
	});
}

function screenshotServiceRequest<T>(
	url: URL,
	config: CustomTypesConfig,
	options: RequestOptions<T> = {},
): Promise<T> {
	const scopedUrl = new URL(url);
	scopedUrl.searchParams.set("repository", config.repo);
	return request(scopedUrl, {
		headers: {
			repository: config.repo,
			Authorization: `Bearer ${config.token}`,
		},
		...options,
	});
}

function getCustomTypesServiceUrl(host: string): URL {
	return new URL(`https://customtypes.${host}/`);
}

function getScreenshotServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/screenshot/`);
}
