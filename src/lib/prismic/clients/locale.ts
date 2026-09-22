import * as z from "zod/mini";

import { request, type RequestOptions } from "../../request";

type LocaleConfig = {
	repo: string;
	token: string | undefined;
	host: string;
};

const LocaleSchema = z.object({
	id: z.string(),
	label: z.string(),
	customName: z.nullable(z.string()),
	isMaster: z.boolean(),
});
export type Locale = z.infer<typeof LocaleSchema>;

export async function getLocales(config: LocaleConfig): Promise<Locale[]> {
	const response = await localeRequest("repository/locales", config, {
		schema: z.object({ results: z.array(LocaleSchema) }),
		unknownErrorMessage: "Failed to load locales",
	});
	return response.results;
}

export async function upsertLocale(
	locale: { id: string; isMaster?: boolean; customName?: string },
	config: LocaleConfig,
): Promise<Locale> {
	return localeRequest("repository/locales", config, {
		method: "POST",
		json: {
			id: locale.id,
			isMaster: locale.isMaster ?? false,
			...(locale.customName ? { customName: locale.customName } : {}),
		},
		schema: LocaleSchema,
		unknownErrorMessage: "Failed to save locale",
	});
}

export async function removeLocale(code: string, config: LocaleConfig): Promise<void> {
	await localeRequest(`repository/locales/${encodeURIComponent(code)}`, config, {
		method: "DELETE",
		notFoundMessage: `Locale not found: ${code}`,
		unknownErrorMessage: "Failed to remove locale",
	});
}

async function localeRequest<T>(
	path: string,
	config: LocaleConfig,
	options: RequestOptions<T>,
): Promise<T> {
	const url = new URL(path, `https://api.internal.${config.host}/locale/`);
	url.searchParams.set("repository", config.repo);
	return request(url, {
		headers: { Authorization: `Bearer ${config.token}` },
		notFoundMessage: `Repository not found: ${config.repo}`,
		...options,
	});
}
