import * as z from "zod/mini";

import { NotFoundRequestError, request } from "../lib/request";

const LocaleSchema = z.object({
	id: z.string(),
	label: z.string(),
	customName: z.nullable(z.string()),
	isMaster: z.boolean(),
});

export type Locale = z.infer<typeof LocaleSchema>;

export async function getLocales(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<Locale[]> {
	const { repo, token, host } = config;
	const url = new URL("repository/locales", getLocaleServiceUrl(host));
	url.searchParams.set("repository", repo);
	try {
		const response = await request(url, {
			headers: { Authorization: `Bearer ${token}` },
			schema: z.object({ results: z.array(LocaleSchema) }),
		});
		return response.results;
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			throw new NotFoundRequestError(error.response, `Repository not found: ${repo}`);
		}
		throw error;
	}
}

export async function upsertLocale(
	locale: { id: string; isMaster?: boolean; customName?: string },
	config: { repo: string; token: string | undefined; host: string },
): Promise<Locale> {
	const { repo, token, host } = config;
	const url = new URL("repository/locales", getLocaleServiceUrl(host));
	url.searchParams.set("repository", repo);
	const response = await request(url, {
		method: "POST",
		body: {
			id: locale.id,
			isMaster: locale.isMaster ?? false,
			...(locale.customName ? { customName: locale.customName } : {}),
		},
		headers: { Authorization: `Bearer ${token}` },
		schema: LocaleSchema,
	});
	return response;
}

export async function removeLocale(
	code: string,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	const { repo, token, host } = config;
	const url = new URL(`repository/locales/${encodeURIComponent(code)}`, getLocaleServiceUrl(host));
	url.searchParams.set("repository", repo);
	await request(url, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${token}` },
	});
}

function getLocaleServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/locale/`);
}
