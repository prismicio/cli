import GithubSlugger from "github-slugger";

import { getDocsPageContent } from "../clients/docs";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { NotFoundRequestError, UnknownRequestError } from "../lib/request";

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
	const { json } = values;

	const hashIndex = rawPath.indexOf("#");
	const path = hashIndex >= 0 ? rawPath.slice(0, hashIndex) : rawPath;
	const anchor = hashIndex >= 0 ? rawPath.slice(hashIndex + 1) : undefined;

	let markdown: string;
	try {
		markdown = await getDocsPageContent(path);
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			throw new CommandError(`Page not found: ${path}`);
		}
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to fetch page: ${message}`);
		}
		throw error;
	}

	if (anchor) {
		const section = extractSection(markdown, anchor);
		if (!section) {
			throw new CommandError(`Anchor not found: #${anchor}`);
		}
		markdown = section;
	}

	if (json) {
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
		const line = lines[i];

		const fenceMatch = line.match(/^(?<fence>`{3,}|~{3,})/);
		const fence = fenceMatch?.groups?.fence;
		if (currentFence) {
			if (fence?.startsWith(currentFence)) currentFence = undefined;
			continue;
		} else if (fence) {
			currentFence = fence;
			continue;
		}

		const headingMatch = line.match(/^(?<level>#{1,6})\s+(?<text>.*)/);
		if (headingMatch?.groups?.level && headingMatch?.groups?.text) {
			if (startIndex !== undefined && headingLevel !== undefined) {
				if (headingMatch.groups.level.length <= headingLevel) {
					endIndex = i;
					break;
				}
			}

			const headingAnchor = slugger.slug(headingMatch.groups.text);
			if (headingAnchor === anchor) {
				startIndex = i;
				headingLevel = headingMatch.groups.level.length;
			}
		}
	}

	if (startIndex === undefined) return;

	return lines.slice(startIndex, endIndex).join("\n").trim();
}
