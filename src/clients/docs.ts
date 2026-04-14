import * as z from "zod/mini";

import { DEFAULT_PRISMIC_HOST, env } from "../env";
import { NotFoundRequestError, request } from "../lib/request";

const DocsIndexEntrySchema = z.object({
	path: z.string(),
	title: z.string(),
	description: z.optional(z.string()),
});
type DocsIndexEntry = z.infer<typeof DocsIndexEntrySchema>;

const DocsPageSchema = z.object({
	path: z.string(),
	title: z.string(),
	description: z.optional(z.string()),
	anchors: z.array(
		z.object({
			slug: z.string(),
			excerpt: z.string(),
		}),
	),
});
type DocsPage = z.infer<typeof DocsPageSchema>;

export async function getDocsIndex(): Promise<DocsIndexEntry[]> {
	const url = new URL("api/index/", getDocsBaseUrl());
	return await request(url, { schema: z.array(DocsIndexEntrySchema) });
}

export async function getDocsPageIndex(path: string): Promise<DocsPage> {
	const url = new URL(`api/index/${path}`, getDocsBaseUrl());
	try {
		return await request(url, { schema: DocsPageSchema });
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Documentation page not found: ${path}`;
		}
		throw error;
	}
}

export async function getDocsPageContent(path: string): Promise<string> {
	const url = new URL(path, getDocsBaseUrl());
	try {
		return await request(url, {
			headers: { Accept: "text/markdown" },
			schema: z.string(),
		});
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Page not found: ${path}`;
		}
		throw error;
	}
}

function getDocsBaseUrl(): URL {
	const host = env.PRISMIC_DOCS_HOST ?? DEFAULT_PRISMIC_HOST;
	return new URL(`https://${host}/docs/`);
}
