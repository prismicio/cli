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
			throw new CommandError(`Documentation page not found: ${path}`);
		}
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to fetch documentation page: ${message}`);
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
	let startIndex = -1;
	let headingLevel = 0;
	let inFence = false;

	for (let i = 0; i < lines.length; i++) {
		if (/^(```|~~~)/.test(lines[i])) {
			inFence = !inFence;
			continue;
		}
		if (inFence) {
			continue;
		}

		const match = lines[i].match(/^(#{1,6})\s+(.*)/);
		if (!match) {
			continue;
		}

		const level = match[1].length;
		const text = match[2];

		if (startIndex >= 0 && level <= headingLevel) {
			return lines.slice(startIndex, i).join("\n").trimEnd();
		}

		if (kebabCase(text) === anchor) {
			startIndex = i;
			headingLevel = level;
		}
	}

	if (startIndex >= 0) {
		return lines.slice(startIndex).join("\n").trimEnd();
	}

	return undefined;
}

function kebabCase(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}
