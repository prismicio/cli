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
	const url = new URL("repository/locales", getLocaleServiceUrl(config.host));
	const response = await localeServiceRequest(url, config, {
		schema: z.object({ results: z.array(LocaleSchema) }),
		unknownErrorMessage: "Failed to load locales",
	});
	return response.results;
}

export async function upsertLocale(
	locale: { id: string; isMaster?: boolean; customName?: string },
	config: LocaleConfig,
): Promise<Locale> {
	const url = new URL("repository/locales", getLocaleServiceUrl(config.host));
	return localeServiceRequest(url, config, {
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
	const url = new URL(
		`repository/locales/${encodeURIComponent(code)}`,
		getLocaleServiceUrl(config.host),
	);
	await localeServiceRequest(url, config, {
		method: "DELETE",
		unknownErrorMessage: "Failed to remove locale",
	});
}

function localeServiceRequest<T>(
	url: URL,
	config: LocaleConfig,
	options?: RequestOptions<T>,
): Promise<T> {
	const scopedUrl = new URL(url);
	scopedUrl.searchParams.set("repository", config.repo);
	return request(scopedUrl, {
		headers: { Authorization: `Bearer ${config.token}` },
		notFoundMessage: `Repository not found: ${config.repo}`,
		...options,
	});
}

function getLocaleServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/locale/`);
}
