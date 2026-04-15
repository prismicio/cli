import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { createHash } from "node:crypto";
import * as z from "zod/mini";

import { NotFoundRequestError, request } from "../lib/request";
import { appendTrailingSlash } from "../lib/url";

export async function getCustomTypes(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<CustomType[]> {
	const { repo, token, host } = config;
	const customTypesServiceUrl = getCustomTypesServiceUrl(host);
	const url = new URL("customtypes", customTypesServiceUrl);
	try {
		const response = await request<CustomType[]>(url, {
			headers: { repository: repo, Authorization: `Bearer ${token}` },
		});
		return response;
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${repo}`;
		}
		throw error;
	}
}

export async function getCustomType(
	id: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<CustomType> {
	const { repo, token, host } = config;
	const customTypesServiceUrl = getCustomTypesServiceUrl(host);
	const url = new URL(`customtypes/${encodeURIComponent(id)}`, customTypesServiceUrl);
	try {
		return await request<CustomType>(url, {
			headers: { repository: repo, Authorization: `Bearer ${token}` },
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Type not found: ${id}`;
		}
		throw error;
	}
}

export async function insertCustomType(
	model: CustomType,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const { repo, token, host } = config;
	const customTypesServiceUrl = getCustomTypesServiceUrl(host);
	const url = new URL("customtypes/insert", customTypesServiceUrl);
	await request(url, {
		method: "POST",
		headers: { repository: repo, Authorization: `Bearer ${token}` },
		body: model,
	});
}

export async function updateCustomType(
	model: CustomType,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const { repo, token, host } = config;
	const customTypesServiceUrl = getCustomTypesServiceUrl(host);
	const url = new URL("customtypes/update", customTypesServiceUrl);
	await request(url, {
		method: "POST",
		headers: { repository: repo, Authorization: `Bearer ${token}` },
		body: model,
	});
}

export async function removeCustomType(
	id: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const { repo, token, host } = config;
	const customTypesServiceUrl = getCustomTypesServiceUrl(host);
	const url = new URL(`customtypes/${encodeURIComponent(id)}`, customTypesServiceUrl);
	await request(url, {
		method: "DELETE",
		headers: { repository: repo, Authorization: `Bearer ${token}` },
	});
}

export async function getSlices(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<SharedSlice[]> {
	const { repo, token, host } = config;
	const customTypesServiceUrl = getCustomTypesServiceUrl(host);
	const url = new URL("slices", customTypesServiceUrl);
	try {
		const response = await request<SharedSlice[]>(url, {
			headers: { repository: repo, Authorization: `Bearer ${token}` },
		});
		return response;
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${repo}`;
		}
		throw error;
	}
}

export async function getSlice(
	id: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<SharedSlice> {
	const { repo, token, host } = config;
	const customTypesServiceUrl = getCustomTypesServiceUrl(host);
	const url = new URL(`slices/${encodeURIComponent(id)}`, customTypesServiceUrl);
	try {
		return await request<SharedSlice>(url, {
			headers: { repository: repo, Authorization: `Bearer ${token}` },
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Slice not found: ${id}`;
		}
		throw error;
	}
}

export async function insertSlice(
	model: SharedSlice,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const { repo, token, host } = config;
	const customTypesServiceUrl = getCustomTypesServiceUrl(host);
	const url = new URL("slices/insert", customTypesServiceUrl);
	await request(url, {
		method: "POST",
		headers: { repository: repo, Authorization: `Bearer ${token}` },
		body: model,
	});
}

export async function updateSlice(
	model: SharedSlice,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const { repo, token, host } = config;
	const customTypesServiceUrl = getCustomTypesServiceUrl(host);
	const url = new URL("slices/update", customTypesServiceUrl);
	await request(url, {
		method: "POST",
		headers: { repository: repo, Authorization: `Bearer ${token}` },
		body: model,
	});
}

export async function removeSlice(
	id: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const { repo, token, host } = config;
	const customTypesServiceUrl = getCustomTypesServiceUrl(host);
	const url = new URL(`slices/${encodeURIComponent(id)}`, customTypesServiceUrl);
	await request(url, {
		method: "DELETE",
		headers: { repository: repo, Authorization: `Bearer ${token}` },
	});
}

const AclCreateResponseSchema = z.object({
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
	const { sliceId, variationId, repo, token, host } = config;

	const type = blob.type;
	if (!(type in SUPPORTED_IMAGE_MIME_TYPES)) {
		throw new UnsupportedFileTypeError(type);
	}

	const aclUrl = new URL("create", getAclProviderUrl(host));
	const acl = await request(aclUrl, {
		headers: { Repository: repo, Authorization: `Bearer ${token}` },
		schema: AclCreateResponseSchema,
	});

	const extension = SUPPORTED_IMAGE_MIME_TYPES[type];
	const digest = createHash("md5")
		.update(new Uint8Array(await blob.arrayBuffer()))
		.digest("hex");
	const key = `${repo}/shared-slices/${sliceId}/${variationId}/${digest}${extension}`;

	const formData = new FormData();
	for (const [field, value] of Object.entries(acl.values.fields)) {
		formData.append(field, value);
	}
	formData.append("key", key);
	formData.append("Content-Type", type);
	formData.append("file", blob);

	await request(acl.values.url, { method: "POST", body: formData });

	const url = new URL(key, appendTrailingSlash(acl.imgixEndpoint));
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

function getCustomTypesServiceUrl(host: string): URL {
	return new URL(`https://customtypes.${host}/`);
}

function getAclProviderUrl(host: string): URL {
	return new URL(`https://acl-provider.${host}/`);
}
