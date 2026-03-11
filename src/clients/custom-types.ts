import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { request } from "../lib/request";

export async function getCustomTypes(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<CustomType[]> {
	const { repo, token, host } = config;
	const customTypesServiceUrl = getCustomTypesServiceUrl(host);
	const url = new URL("customtypes", customTypesServiceUrl);
	const response = await request<CustomType[]>(url, {
		headers: { repository: repo, Authorization: `Bearer ${token}` },
	});
	return response;
}

export async function getSlices(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<SharedSlice[]> {
	const { repo, token, host } = config;
	const customTypesServiceUrl = getCustomTypesServiceUrl(host);
	const url = new URL("slices", customTypesServiceUrl);
	const response = await request<SharedSlice[]>(url, {
		headers: { repository: repo, Authorization: `Bearer ${token}` },
	});
	return response;
}

function getCustomTypesServiceUrl(host: string): URL {
	return new URL(`https://customtypes.${host}/`);
}
