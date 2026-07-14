import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getDocsIndex, getDocsPageIndex } from "../lib/prismic/clients/docs";
import { formatTable } from "../lib/string";

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

export default createCommand(config, async ({ positionals, values }) => {
	const [path] = positionals;
	const { json } = values;

	if (path) {
		const entry = await getDocsPageIndex(path);

		if (json) {
			console.info(stringify(entry));
			return;
		}

		if (entry.anchors.length === 0) {
			console.info("(no anchors)");
			return;
		}

		const rows = entry.anchors.map((anchor) => [`${path}#${anchor.slug}`, anchor.excerpt]);
		console.info(formatTable(rows, { headers: ["PATH", "EXCERPT"] }));
	} else {
		const pages = await getDocsIndex();

		pages.sort((a, b) => a.path.localeCompare(b.path));

		if (json) {
			console.info(stringify(pages));
			return;
		}

		if (pages.length === 0) {
			console.info("No documentation pages found.");
			return;
		}

		const rows = pages.map((page) => [page.path, page.title, page.description ?? ""]);
		console.info(formatTable(rows, { headers: ["PATH", "TITLE", "DESCRIPTION"] }));
	}
});
