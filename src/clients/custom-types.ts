import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import * as z from "zod/mini";

import { CommandError } from "../lib/command";
import { NotFoundRequestError, request } from "../lib/request";

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
	await request<CustomType[]>(url, {
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
	await request<void>(url, {
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
	await request<CustomType[]>(url, {
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
	await request<CustomType[]>(url, {
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
	await request<void>(url, {
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
	await request<CustomType[]>(url, {
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

const MIME_TYPES: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
};

export async function uploadScreenshot(
	source: string,
	config: { repo: string; sliceId: string; variationId: string; token: string | undefined; host: string },
): Promise<string> {
	const { repo, sliceId, variationId, token, host } = config;

	const { data, ext } = await resolveScreenshotSource(source);

	const mimeType = MIME_TYPES[ext];
	if (!mimeType) {
		const supported = Object.keys(MIME_TYPES).join(", ");
		throw new CommandError(
			`Unsupported screenshot format "${ext}". Supported: ${supported}`,
		);
	}

	const digest = createHash("md5").update(data).digest("hex");
	const key = `${repo}/shared-slices/${sliceId}/${variationId}/${digest}${ext}`;

	const aclUrl = new URL("create", getAclProviderUrl(host));
	const acl = await request(aclUrl, {
		headers: { Repository: repo, Authorization: `Bearer ${token}` },
		schema: AclCreateResponseSchema,
	});

	const formData = new FormData();
	for (const [field, value] of Object.entries(acl.values.fields)) {
		formData.append(field, value);
	}
	formData.append("key", key);
	formData.append("Content-Type", mimeType);
	const fileBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
	formData.append("file", new Blob([fileBuffer], { type: mimeType }));

	await request(acl.values.url, { method: "POST", body: formData });

	const url = new URL(key, acl.imgixEndpoint);
	url.searchParams.set("auto", "compress,format");
	return url.toString();
}

async function resolveScreenshotSource(
	source: string,
): Promise<{ data: Uint8Array; ext: string }> {
	if (URL.canParse(source)) {
		const url = new URL(source);
		if (url.protocol === "http:" || url.protocol === "https:") {
			const response = await fetch(source);
			if (!response.ok) {
				throw new CommandError(
					`Failed to download screenshot from "${source}" (HTTP ${response.status}).`,
				);
			}

			let ext = extname(url.pathname).toLowerCase();
			if (!MIME_TYPES[ext]) {
				const contentType = response.headers.get("content-type")?.split(";")[0].trim();
				const match = Object.entries(MIME_TYPES).find(([, mime]) => mime === contentType);
				ext = match?.[0] ?? ext;
			}

			const data = new Uint8Array(await response.arrayBuffer());
			return { data, ext };
		}
	}

	let data: Uint8Array;
	try {
		data = await readFile(source);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new CommandError(`Screenshot file not found: ${source}`);
		}
		throw error;
	}

	const ext = extname(source).toLowerCase();
	return { data, ext };
}

function getCustomTypesServiceUrl(host: string): URL {
	return new URL(`https://customtypes.${host}/`);
}

function getAclProviderUrl(host: string): URL {
	return new URL(`https://acl-provider.${host}/`);
}
