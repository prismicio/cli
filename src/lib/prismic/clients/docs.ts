import * as z from "zod/mini";

import { request } from "../../request";

type DocsConfig = { host?: string; headers?: Record<string, string> };

const DocsIndexEntrySchema = z.object({
	path: z.string(),
	title: z.string(),
	description: z.optional(z.string()),
});

const DocsPageSchema = z.extend(DocsIndexEntrySchema, {
	anchors: z.array(
		z.object({
			slug: z.string(),
			excerpt: z.string(),
		}),
	),
});

export async function getDocsIndex(
	config?: DocsConfig,
): Promise<z.infer<typeof DocsIndexEntrySchema>[]> {
	return request(getDocsUrl("api/index/", config), {
		schema: z.array(DocsIndexEntrySchema),
		unknownErrorMessage: "Failed to fetch documentation index",
	});
}

export async function getDocsPageIndex(
	path: string,
	config?: DocsConfig,
): Promise<z.infer<typeof DocsPageSchema>> {
	return request(getDocsUrl(`api/index/${path}`, config), {
		schema: DocsPageSchema,
		notFoundMessage: `Documentation page not found: ${path}`,
		unknownErrorMessage: "Failed to fetch documentation index",
	});
}

export async function getDocsPageContent(path: string, config?: DocsConfig): Promise<string> {
	return request(getDocsUrl(path, config), {
		headers: { Accept: "text/markdown", ...config?.headers },
		schema: z.string(),
		notFoundMessage: `Page not found: ${path}`,
		unknownErrorMessage: "Failed to fetch documentation page",
	});
}

// Documentation is only published at prismic.io; the host option exists for
// overrides only.
function getDocsUrl(path: string, config: DocsConfig = {}): URL {
	return new URL(path, `https://${config.host ?? "prismic.io"}/docs/`);
}
