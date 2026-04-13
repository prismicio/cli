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

function getCustomTypesServiceUrl(host: string): URL {
	return new URL(`https://customtypes.${host}/`);
}
