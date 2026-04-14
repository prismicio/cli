import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

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

function getCustomTypesServiceUrl(host: string): URL {
	return new URL(`https://customtypes.${host}/`);
}
