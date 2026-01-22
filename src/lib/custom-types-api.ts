import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { readdir, readFile } from "node:fs/promises";
import * as v from "valibot";

import { readHost, readToken } from "./auth";
import { findUpward } from "./file";
import { getSlicesDirectory, SharedSliceSchema } from "./slice";

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

export async function fetchCustomType(repo: string, id: string): Promise<FetchResult<CustomType>> {
	const token = await readToken();
	if (!token) {
		return { ok: false, error: "Not authenticated" };
	}

	const baseUrl = await getCustomTypesApiUrl();
	const url = new URL(`customtypes/${encodeURIComponent(id)}`, baseUrl);

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
			if (response.status === 404) {
				return { ok: false, error: `Custom type "${id}" not found in repository "${repo}".` };
			}
			return { ok: false, error: `API error: ${response.status} ${response.statusText}` };
		}

		const data = await response.json();
		const result = v.safeParse(CustomTypeSchema, data);
		if (!result.success) {
			return { ok: false, error: "Invalid response from Custom Types API" };
		}

		return { ok: true, value: result.output as CustomType };
	} catch (error) {
		return { ok: false, error: `Network error: ${error instanceof Error ? error.message : error}` };
	}
}

export async function fetchSlice(repo: string, id: string): Promise<FetchResult<SharedSlice>> {
	const token = await readToken();
	if (!token) {
		return { ok: false, error: "Not authenticated" };
	}

	const baseUrl = await getCustomTypesApiUrl();
	const url = new URL(`slices/${encodeURIComponent(id)}`, baseUrl);

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
			if (response.status === 404) {
				return { ok: false, error: `Slice "${id}" not found in repository "${repo}".` };
			}
			return { ok: false, error: `API error: ${response.status} ${response.statusText}` };
		}

		const data = await response.json();
		const result = v.safeParse(SharedSliceSchema, data);
		if (!result.success) {
			return { ok: false, error: "Invalid response from Custom Types API" };
		}

		return { ok: true, value: result.output as SharedSlice };
	} catch (error) {
		return { ok: false, error: `Network error: ${error instanceof Error ? error.message : error}` };
	}
}

export async function fetchRemoteCustomType(
	repo: string,
	id: string,
): Promise<FetchResult<CustomType>> {
	const result = await fetchCustomType(repo, id);
	if (!result.ok) {
		return result;
	}

	if (result.value.format === "page") {
		return {
			ok: false,
			error: `"${id}" is not a custom type (format: page)`,
		};
	}

	return result;
}

export async function fetchRemoteNonPageCustomTypes(
	repo: string,
): Promise<FetchResult<CustomType[]>> {
	const result = await fetchRemoteCustomTypes(repo);
	if (!result.ok) {
		return result;
	}

	return { ok: true, value: result.value.filter((ct) => ct.format !== "page") };
}

export async function fetchRemotePageType(
	repo: string,
	id: string,
): Promise<FetchResult<CustomType>> {
	const result = await fetchCustomType(repo, id);
	if (!result.ok) {
		return result;
	}

	if (result.value.format !== "page") {
		return {
			ok: false,
			error: `"${id}" is not a page type (format: ${result.value.format ?? "custom"})`,
		};
	}

	return result;
}

export async function fetchRemotePageTypes(repo: string): Promise<FetchResult<CustomType[]>> {
	const result = await fetchRemoteCustomTypes(repo);
	if (!result.ok) {
		return result;
	}

	return { ok: true, value: result.value.filter((ct) => ct.format === "page") };
}

export async function readLocalCustomTypes(): Promise<FetchResult<CustomType[]>> {
	const projectRoot = await findUpward("package.json");
	if (!projectRoot) {
		return { ok: false, error: "Could not find project root (no package.json found)" };
	}

	const projectDir = new URL(".", projectRoot);
	const customTypesDir = new URL("customtypes/", projectDir);

	let entries: string[];
	try {
		entries = (await readdir(customTypesDir, { withFileTypes: false })) as unknown as string[];
	} catch {
		// No customtypes directory means no local custom types
		return { ok: true, value: [] };
	}

	const customTypes: CustomType[] = [];
	for (const entry of entries) {
		const modelPath = new URL(`${entry}/index.json`, customTypesDir);
		try {
			const contents = await readFile(modelPath, "utf8");
			const parsed = JSON.parse(contents);
			const result = v.safeParse(CustomTypeSchema, parsed);
			if (result.success) {
				customTypes.push(result.output as CustomType);
			}
		} catch {
			// Skip directories without valid index.json
		}
	}

	return { ok: true, value: customTypes };
}

export async function readLocalSlices(): Promise<FetchResult<SharedSlice[]>> {
	let slicesDir: URL;
	try {
		slicesDir = await getSlicesDirectory();
	} catch {
		return { ok: false, error: "Could not find project root (no package.json found)" };
	}

	let entries: string[];
	try {
		entries = (await readdir(slicesDir, { withFileTypes: false })) as unknown as string[];
	} catch {
		// No slices directory means no local slices
		return { ok: true, value: [] };
	}

	const slices: SharedSlice[] = [];
	for (const entry of entries) {
		const modelPath = new URL(`${entry}/model.json`, slicesDir);
		try {
			const contents = await readFile(modelPath, "utf8");
			const parsed = JSON.parse(contents);
			const result = v.safeParse(SharedSliceSchema, parsed);
			if (result.success) {
				slices.push(result.output as SharedSlice);
			}
		} catch {
			// Skip directories without valid model.json
		}
	}

	return { ok: true, value: slices };
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
