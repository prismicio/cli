import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import * as v from "valibot";

import { readHost, readToken } from "./auth";

const SharedSliceSchema = v.object({
	id: v.string(),
	type: v.literal("SharedSlice"),
	name: v.string(),
	description: v.optional(v.string()),
	variations: v.array(
		v.object({
			id: v.string(),
			name: v.string(),
			description: v.optional(v.string()),
			docURL: v.optional(v.string()),
			version: v.optional(v.string()),
			imageUrl: v.optional(v.string()),
			primary: v.optional(v.record(v.string(), v.unknown())),
			items: v.optional(v.record(v.string(), v.unknown())),
		}),
	),
});

export const CustomTypeSchema = v.object({
	id: v.string(),
	label: v.optional(v.string()),
	repeatable: v.boolean(),
	status: v.boolean(),
	format: v.optional(v.string()),
	json: v.record(v.string(), v.unknown()),
});

export type FetchResult<T> = { ok: true; value: T } | { ok: false; error: string };

export async function getCustomTypesApiUrl(): Promise<URL> {
	const host = await readHost();
	host.hostname = `customtypes.${host.hostname}`;
	return host;
}

export async function fetchRemoteCustomTypes(repo: string): Promise<FetchResult<CustomType[]>> {
	const token = await readToken();
	if (!token) {
		return { ok: false, error: "Not authenticated" };
	}

	const baseUrl = await getCustomTypesApiUrl();
	const url = new URL("customtypes", baseUrl);

	try {
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				repository: repo,
			},
		});

		if (!response.ok) {
			if (response.status === 401) {
				return {
					ok: false,
					error: "Unauthorized. Your session may have expired. Run `prismic login` again.",
				};
			}
			if (response.status === 403) {
				return {
					ok: false,
					error: `Access denied. You may not have access to repository "${repo}".`,
				};
			}
			return { ok: false, error: `API error: ${response.status} ${response.statusText}` };
		}

		const data = await response.json();
		const result = v.safeParse(v.array(CustomTypeSchema), data);
		if (!result.success) {
			return { ok: false, error: "Invalid response from Custom Types API" };
		}

		return { ok: true, value: result.output as CustomType[] };
	} catch (error) {
		return { ok: false, error: `Network error: ${error instanceof Error ? error.message : error}` };
	}
}

export async function fetchRemoteSlices(repo: string): Promise<FetchResult<SharedSlice[]>> {
	const token = await readToken();
	if (!token) {
		return { ok: false, error: "Not authenticated" };
	}

	const baseUrl = await getCustomTypesApiUrl();
	const url = new URL("slices", baseUrl);

	try {
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				repository: repo,
			},
		});

		if (!response.ok) {
			if (response.status === 401) {
				return {
					ok: false,
					error: "Unauthorized. Your session may have expired. Run `prismic login` again.",
				};
			}
			if (response.status === 403) {
				return {
					ok: false,
					error: `Access denied. You may not have access to repository "${repo}".`,
				};
			}
			return { ok: false, error: `API error: ${response.status} ${response.statusText}` };
		}

		const data = await response.json();
		const result = v.safeParse(v.array(SharedSliceSchema), data);
		if (!result.success) {
			return { ok: false, error: "Invalid response from Custom Types API" };
		}

		return { ok: true, value: result.output as SharedSlice[] };
	} catch (error) {
		return { ok: false, error: `Network error: ${error instanceof Error ? error.message : error}` };
	}
}

export async function insertCustomType(
	repo: string,
	model: CustomType,
): Promise<FetchResult<void>> {
	const token = await readToken();
	if (!token) {
		return { ok: false, error: "Not authenticated" };
	}

	const baseUrl = await getCustomTypesApiUrl();
	const url = new URL("customtypes/insert", baseUrl);

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				repository: repo,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(model),
		});

		if (!response.ok) {
			if (response.status === 401) {
				return {
					ok: false,
					error: "Unauthorized. Your session may have expired. Run `prismic login` again.",
				};
			}
			if (response.status === 403) {
				return {
					ok: false,
					error: `Access denied. You may not have access to repository "${repo}".`,
				};
			}
			return { ok: false, error: `API error: ${response.status} ${response.statusText}` };
		}

		return { ok: true, value: undefined };
	} catch (error) {
		return { ok: false, error: `Network error: ${error instanceof Error ? error.message : error}` };
	}
}

export async function updateCustomType(
	repo: string,
	model: CustomType,
): Promise<FetchResult<void>> {
	const token = await readToken();
	if (!token) {
		return { ok: false, error: "Not authenticated" };
	}

	const baseUrl = await getCustomTypesApiUrl();
	const url = new URL("customtypes/update", baseUrl);

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				repository: repo,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(model),
		});

		if (!response.ok) {
			if (response.status === 401) {
				return {
					ok: false,
					error: "Unauthorized. Your session may have expired. Run `prismic login` again.",
				};
			}
			if (response.status === 403) {
				return {
					ok: false,
					error: `Access denied. You may not have access to repository "${repo}".`,
				};
			}
			return { ok: false, error: `API error: ${response.status} ${response.statusText}` };
		}

		return { ok: true, value: undefined };
	} catch (error) {
		return { ok: false, error: `Network error: ${error instanceof Error ? error.message : error}` };
	}
}

export async function deleteCustomType(repo: string, id: string): Promise<FetchResult<void>> {
	const token = await readToken();
	if (!token) {
		return { ok: false, error: "Not authenticated" };
	}

	const baseUrl = await getCustomTypesApiUrl();
	const url = new URL(`customtypes/${encodeURIComponent(id)}`, baseUrl);

	try {
		const response = await fetch(url, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${token}`,
				repository: repo,
			},
		});

		if (!response.ok) {
			if (response.status === 401) {
				return {
					ok: false,
					error: "Unauthorized. Your session may have expired. Run `prismic login` again.",
				};
			}
			if (response.status === 403) {
				return {
					ok: false,
					error: `Access denied. You may not have access to repository "${repo}".`,
				};
			}
			return { ok: false, error: `API error: ${response.status} ${response.statusText}` };
		}

		return { ok: true, value: undefined };
	} catch (error) {
		return { ok: false, error: `Network error: ${error instanceof Error ? error.message : error}` };
	}
}

export async function insertSlice(repo: string, model: SharedSlice): Promise<FetchResult<void>> {
	const token = await readToken();
	if (!token) {
		return { ok: false, error: "Not authenticated" };
	}

	const baseUrl = await getCustomTypesApiUrl();
	const url = new URL("slices/insert", baseUrl);

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				repository: repo,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(model),
		});

		if (!response.ok) {
			if (response.status === 401) {
				return {
					ok: false,
					error: "Unauthorized. Your session may have expired. Run `prismic login` again.",
				};
			}
			if (response.status === 403) {
				return {
					ok: false,
					error: `Access denied. You may not have access to repository "${repo}".`,
				};
			}
			return { ok: false, error: `API error: ${response.status} ${response.statusText}` };
		}

		return { ok: true, value: undefined };
	} catch (error) {
		return { ok: false, error: `Network error: ${error instanceof Error ? error.message : error}` };
	}
}

export async function updateSlice(repo: string, model: SharedSlice): Promise<FetchResult<void>> {
	const token = await readToken();
	if (!token) {
		return { ok: false, error: "Not authenticated" };
	}

	const baseUrl = await getCustomTypesApiUrl();
	const url = new URL("slices/update", baseUrl);

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				repository: repo,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(model),
		});

		if (!response.ok) {
			if (response.status === 401) {
				return {
					ok: false,
					error: "Unauthorized. Your session may have expired. Run `prismic login` again.",
				};
			}
			if (response.status === 403) {
				return {
					ok: false,
					error: `Access denied. You may not have access to repository "${repo}".`,
				};
			}
			return { ok: false, error: `API error: ${response.status} ${response.statusText}` };
		}

		return { ok: true, value: undefined };
	} catch (error) {
		return { ok: false, error: `Network error: ${error instanceof Error ? error.message : error}` };
	}
}

export async function deleteSlice(repo: string, id: string): Promise<FetchResult<void>> {
	const token = await readToken();
	if (!token) {
		return { ok: false, error: "Not authenticated" };
	}

	const baseUrl = await getCustomTypesApiUrl();
	const url = new URL(`slices/${encodeURIComponent(id)}`, baseUrl);

	try {
		const response = await fetch(url, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${token}`,
				repository: repo,
			},
		});

		if (!response.ok) {
			if (response.status === 401) {
				return {
					ok: false,
					error: "Unauthorized. Your session may have expired. Run `prismic login` again.",
				};
			}
			if (response.status === 403) {
				return {
					ok: false,
					error: `Access denied. You may not have access to repository "${repo}".`,
				};
			}
			return { ok: false, error: `API error: ${response.status} ${response.statusText}` };
		}

		return { ok: true, value: undefined };
	} catch (error) {
		return { ok: false, error: `Network error: ${error instanceof Error ? error.message : error}` };
	}
}
