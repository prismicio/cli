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

export function getCustomTypes(config: CustomTypesConfig): Promise<CustomType[]> {
	const url = new URL("customtypes", getCustomTypesServiceUrl(config.host));
	return customTypesServiceRequest<CustomType[]>(url, config);
}

export async function getCustomType(id: string, config: CustomTypesConfig): Promise<CustomType> {
	const url = new URL(
		`customtypes/${encodeURIComponent(id)}`,
		getCustomTypesServiceUrl(config.host),
	);
	return customTypesServiceRequest<CustomType>(url, config, {
		notFoundMessage: `Type not found: ${id}`,
	});
}

export async function insertCustomType(
	model: CustomType,
	config: CustomTypesConfig,
): Promise<void> {
	const url = new URL("customtypes/insert", getCustomTypesServiceUrl(config.host));
	await customTypesServiceRequest(url, config, {
		method: "POST",
		json: model,
	});
}

export async function updateCustomType(
	model: CustomType,
	config: CustomTypesConfig,
): Promise<void> {
	const url = new URL("customtypes/update", getCustomTypesServiceUrl(config.host));
	await customTypesServiceRequest(url, config, {
		method: "POST",
		json: model,
		notFoundMessage: `Type not found: ${model.id}`,
	});
}

export async function removeCustomType(id: string, config: CustomTypesConfig): Promise<void> {
	const url = new URL(
		`customtypes/${encodeURIComponent(id)}`,
		getCustomTypesServiceUrl(config.host),
	);
	await customTypesServiceRequest(url, config, {
		method: "DELETE",
		notFoundMessage: `Type not found: ${id}`,
	});
}

export function getSlices(config: CustomTypesConfig): Promise<SharedSlice[]> {
	const url = new URL("slices", getCustomTypesServiceUrl(config.host));
	return customTypesServiceRequest<SharedSlice[]>(url, config);
}

export async function getSlice(id: string, config: CustomTypesConfig): Promise<SharedSlice> {
	const url = new URL(`slices/${encodeURIComponent(id)}`, getCustomTypesServiceUrl(config.host));
	return customTypesServiceRequest<SharedSlice>(url, config, {
		notFoundMessage: `Slice not found: ${id}`,
	});
}

export async function insertSlice(model: SharedSlice, config: CustomTypesConfig): Promise<void> {
	const url = new URL("slices/insert", getCustomTypesServiceUrl(config.host));
	await customTypesServiceRequest(url, config, {
		method: "POST",
		json: model,
	});
}

export async function updateSlice(model: SharedSlice, config: CustomTypesConfig): Promise<void> {
	const url = new URL("slices/update", getCustomTypesServiceUrl(config.host));
	await customTypesServiceRequest(url, config, {
		method: "POST",
		json: model,
		notFoundMessage: `Slice not found: ${model.id}`,
	});
}

export async function removeSlice(id: string, config: CustomTypesConfig): Promise<void> {
	const url = new URL(`slices/${encodeURIComponent(id)}`, getCustomTypesServiceUrl(config.host));
	await customTypesServiceRequest(url, config, {
		method: "DELETE",
		notFoundMessage: `Slice not found: ${id}`,
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
	return request(url, {
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
