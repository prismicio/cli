import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { createHash } from "node:crypto";
import * as z from "zod/mini";

import { request, type RequestOptions } from "../../request";
import { appendTrailingSlash } from "../../url";

type CustomTypesConfig = {
	repo: string;
	token: string | undefined;
	host: string;
};

export async function getCustomTypes(config: CustomTypesConfig): Promise<CustomType[]> {
	return customTypesRequest("customtypes", config);
}

export async function getCustomType(id: string, config: CustomTypesConfig): Promise<CustomType> {
	return customTypesRequest(`customtypes/${encodeURIComponent(id)}`, config, {
		notFoundMessage: `Type not found: ${id}`,
	});
}

export async function insertCustomType(
	model: CustomType,
	config: CustomTypesConfig,
): Promise<void> {
	await customTypesRequest("customtypes/insert", config, {
		method: "POST",
		json: model,
		unknownErrorMessage: `Failed to create type "${model.id}"`,
	});
}

export async function updateCustomType(
	model: CustomType,
	config: CustomTypesConfig,
): Promise<void> {
	await customTypesRequest("customtypes/update", config, {
		method: "POST",
		json: model,
		notFoundMessage: `Type not found: ${model.id}`,
		unknownErrorMessage: `Failed to update type "${model.id}"`,
	});
}

export async function removeCustomType(id: string, config: CustomTypesConfig): Promise<void> {
	await customTypesRequest(`customtypes/${encodeURIComponent(id)}`, config, {
		method: "DELETE",
		notFoundMessage: `Type not found: ${id}`,
		unknownErrorMessage: `Failed to delete type "${id}"`,
	});
}

export async function getSlices(config: CustomTypesConfig): Promise<SharedSlice[]> {
	return customTypesRequest("slices", config);
}

export async function getSlice(id: string, config: CustomTypesConfig): Promise<SharedSlice> {
	return customTypesRequest(`slices/${encodeURIComponent(id)}`, config, {
		notFoundMessage: `Slice not found: ${id}`,
	});
}

export async function insertSlice(model: SharedSlice, config: CustomTypesConfig): Promise<void> {
	await customTypesRequest("slices/insert", config, {
		method: "POST",
		json: model,
		unknownErrorMessage: `Failed to create slice "${model.id}"`,
	});
}

export async function updateSlice(model: SharedSlice, config: CustomTypesConfig): Promise<void> {
	await customTypesRequest("slices/update", config, {
		method: "POST",
		json: model,
		notFoundMessage: `Slice not found: ${model.id}`,
		unknownErrorMessage: `Failed to update slice "${model.id}"`,
	});
}

export async function removeSlice(id: string, config: CustomTypesConfig): Promise<void> {
	await customTypesRequest(`slices/${encodeURIComponent(id)}`, config, {
		method: "DELETE",
		notFoundMessage: `Slice not found: ${id}`,
		unknownErrorMessage: `Failed to delete slice "${id}"`,
	});
}

const SUPPORTED_IMAGE_MIME_TYPES: Record<string, string> = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/gif": ".gif",
	"image/webp": ".webp",
};

export async function deleteScreenshots(sliceId: string, config: CustomTypesConfig): Promise<void> {
	await screenshotRequest("delete", config, {
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
	const { sliceId, variationId, repo } = config;

	if (!(blob.type in SUPPORTED_IMAGE_MIME_TYPES)) throw new UnsupportedFileTypeError(blob.type);

	const presigned = await screenshotRequest("presigned-url", config, {
		schema: z.object({
			values: z.object({
				url: z.string(),
				fields: z.record(z.string(), z.string()),
			}),
			imgixEndpoint: z.string(),
		}),
	});

	const digest = createHash("sha1")
		.update(new Uint8Array(await blob.arrayBuffer()))
		.digest("hex");
	const extension = SUPPORTED_IMAGE_MIME_TYPES[blob.type];
	const key = `${repo}/shared-slices/${sliceId}/${variationId}/${digest}${extension}`;

	const formData = new FormData();
	for (const [field, value] of Object.entries(presigned.values.fields)) {
		formData.append(field, value);
	}
	formData.set("key", key);
	formData.set("Content-Type", blob.type);
	formData.set("file", blob);

	await request(presigned.values.url, { method: "POST", body: formData });

	const url = new URL(key, appendTrailingSlash(presigned.imgixEndpoint));
	url.searchParams.set("auto", "compress,format");
	return url;
}

export class UnsupportedFileTypeError extends Error {
	name = "UnsupportedFileTypeError";

	constructor(mimeType: string) {
		const supportedTypes = Object.keys(SUPPORTED_IMAGE_MIME_TYPES).join(", ");
		super(`Unsupported file type: ${mimeType || "unknown"}. Supported: ${supportedTypes}`);
	}
}

async function customTypesRequest<T>(
	path: string,
	config: CustomTypesConfig,
	options: RequestOptions<T> = {},
): Promise<T> {
	return request(new URL(path, `https://customtypes.${config.host}/`), {
		headers: {
			repository: config.repo,
			Authorization: `Bearer ${config.token}`,
		},
		notFoundMessage: `Repository not found: ${config.repo}`,
		...options,
	});
}

async function screenshotRequest<T>(
	path: string,
	config: CustomTypesConfig,
	options: RequestOptions<T>,
): Promise<T> {
	const url = new URL(path, `https://api.internal.${config.host}/screenshot/`);
	url.searchParams.set("repository", config.repo);
	return request(url, {
		headers: {
			repository: config.repo,
			Authorization: `Bearer ${config.token}`,
		},
		...options,
	});
}
