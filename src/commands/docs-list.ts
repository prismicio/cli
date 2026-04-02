import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";

const DOCS_INDEX_URL = new URL("https://prismic.io/docs/api/index/");

const config = {
	name: "prismic docs list",
	description: `
		List available documentation pages.

		With a path argument, list the anchors within that page.
	`,
	positionals: {
		path: {
			description: "Documentation path to list anchors for",
			required: false,
		},
	},
	options: {
		json: { type: "boolean", description: "Output as JSON" },
	},
} satisfies CommandConfig;

type IndexPage = {
	path: string;
	title: string;
	description: string;
};

type IndexPageWithAnchors = IndexPage & {
	anchors: { slug: string; excerpt: string }[];
};

export default createCommand(config, async ({ positionals, values }) => {
	const [path] = positionals;
	const { json } = values;

	if (path) {
		const url = new URL(path, DOCS_INDEX_URL);
		const response = await fetch(url);

		if (!response.ok) {
			if (response.status === 404) {
				throw new CommandError(`Documentation page not found: ${path}`);
			}
			throw new CommandError(`Failed to fetch documentation index: ${response.statusText}`);
		}

		const entry: IndexPageWithAnchors = await response.json();
		entry.anchors.sort((a, b) => a.slug.localeCompare(b.slug));

		if (json) {
			console.info(stringify(entry));
			return;
		}

		if (entry.anchors.length === 0) {
			console.info("(no anchors)");
			return;
		}

		for (const anchor of entry.anchors) {
			console.info(`${path}#${anchor.slug}: ${anchor.excerpt}`);
		}
	} else {
		const response = await fetch(DOCS_INDEX_URL);

		if (!response.ok) {
			throw new CommandError(`Failed to fetch documentation index: ${response.statusText}`);
		}

		const pages: IndexPage[] = await response.json();
		pages.sort((a, b) => a.path.localeCompare(b.path));

		if (json) {
			console.info(stringify(pages));
			return;
		}

		if (pages.length === 0) {
			console.info("No documentation pages found.");
			return;
		}

		for (const page of pages) {
			console.info(`${page.path}: ${page.title} — ${page.description}`);
		}
	}
});
