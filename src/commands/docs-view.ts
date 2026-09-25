import GithubSlugger from "github-slugger";

import { env } from "../env";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getDocsPageContent } from "../lib/prismic/clients/docs";
import { getAnalyticsHeaders } from "../tracking";

const config = {
	name: "prismic docs view",
	description: `
		View a documentation page as Markdown.

		Append #anchor to the path to view only the section under that heading.
	`,
	positionals: {
		path: {
			description: "Documentation path, optionally with #anchor (e.g., setup#install)",
			required: true,
		},
	},
	options: {
		json: { type: "boolean", description: "Output as JSON" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [rawPath] = positionals;

	const hashIndex = rawPath.indexOf("#");
	const path = hashIndex >= 0 ? rawPath.slice(0, hashIndex) : rawPath;
	const anchor = hashIndex >= 0 ? rawPath.slice(hashIndex + 1) : undefined;

	let markdown = await getDocsPageContent(path, {
		host: env.PRISMIC_DOCS_HOST,
		headers: getAnalyticsHeaders(),
	});

	if (anchor) {
		const section = extractSection(markdown, anchor);
		if (!section) {
			throw new CommandError(`Anchor not found: #${anchor}`);
		}
		markdown = section;
	}

	if (values.json) {
		console.info(stringify({ path, anchor, content: markdown }));
		return;
	}

	console.info(markdown);
});

function extractSection(markdown: string, anchor: string): string | undefined {
	const lines = markdown.split("\n");
	const slugger = new GithubSlugger();

	let currentFence: string | undefined;
	let startIndex: number | undefined;
	let endIndex: number | undefined;
	let headingLevel: number | undefined;

	for (let i = 0; i < lines.length; i++) {
		const fence = lines[i].match(/^(`{3,}|~{3,})/)?.[1];
		if (currentFence) {
			if (fence?.startsWith(currentFence)) currentFence = undefined;
			continue;
		}
		if (fence) {
			currentFence = fence;
			continue;
		}

		const [, hashes, text] = lines[i].match(/^(#{1,6})\s+(.*)/) ?? [];
		if (!hashes || !text) continue;
		if (headingLevel !== undefined && hashes.length <= headingLevel) {
			endIndex = i;
			break;
		}
		if (slugger.slug(text) === anchor) {
			startIndex = i;
			headingLevel = hashes.length;
		}
	}

	if (startIndex === undefined) return;

	return lines.slice(startIndex, endIndex).join("\n").trim();
}
