import { parseArgs } from "node:util";

const HELP = `
List documentation pages from Prismic's docs site.

USAGE
  prismic docs list [flags]

FLAGS
  -h, --help   Show help for command

EXAMPLES
  prismic docs list
`.trim();

const ROOT_SITEMAP_URL = "https://prismic.io/docs/sitemap.xml";

function decodeXmlEntities(input: string): string {
	return input
		.replaceAll("&amp;", "&")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'");
}

function extractLocEntries(xml: string): string[] {
	const locPattern = /<loc>(.*?)<\/loc>/g;
	const entries: string[] = [];
	let match = locPattern.exec(xml);

	while (match) {
		entries.push(decodeXmlEntities(match[1]).trim());
		match = locPattern.exec(xml);
	}

	return entries.filter(Boolean);
}

async function fetchXml(url: string): Promise<{ ok: true; xml: string } | { ok: false; error: string }> {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			return {
				ok: false,
				error: `Failed to fetch sitemap: ${response.status} (${url})`,
			};
		}

		return {
			ok: true,
			xml: await response.text(),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, error: `Network error while fetching sitemap ${url}: ${message}` };
	}
}

function toDocsPath(urlString: string): string | null {
	try {
		const url = new URL(urlString);
		if (url.hostname !== "prismic.io") {
			return null;
		}

		if (!url.pathname.startsWith("/docs/")) {
			return null;
		}

		return url.pathname.replace(/^\/docs\//, "").replace(/^\/+|\/+$/g, "");
	} catch {
		return null;
	}
}

export async function docsList(): Promise<void> {
	const {
		values: { help },
	} = parseArgs({
		args: process.argv.slice(4),
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	const rootResult = await fetchXml(ROOT_SITEMAP_URL);
	if (!rootResult.ok) {
		console.error(rootResult.error);
		process.exitCode = 1;
		return;
	}

	const nestedSitemapUrls = extractLocEntries(rootResult.xml);
	if (nestedSitemapUrls.length === 0) {
		console.error(`No nested sitemaps found in ${ROOT_SITEMAP_URL}`);
		process.exitCode = 1;
		return;
	}

	const nestedResults = await Promise.all(nestedSitemapUrls.map((url) => fetchXml(url)));
	const failedFetch = nestedResults.find((result) => !result.ok);
	if (failedFetch && !failedFetch.ok) {
		console.error(failedFetch.error);
		process.exitCode = 1;
		return;
	}

	const paths = new Set<string>();

	for (const nestedResult of nestedResults) {
		if (!nestedResult.ok) continue;

		for (const url of extractLocEntries(nestedResult.xml)) {
			const path = toDocsPath(url);
			if (path) {
				paths.add(path);
			}
		}
	}

	for (const path of [...paths].sort((a, b) => a.localeCompare(b))) {
		console.info(path);
	}
}
