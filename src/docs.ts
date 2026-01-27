import { parseArgs } from "node:util";

const HELP = `
Fetch and display documentation from Prismic's docs site.

USAGE
  prismic docs <path> [flags]

ARGUMENTS
  path    Documentation path with optional anchor (e.g., "nextjs" or "nextjs#set-up-a-prismic-client")

FLAGS
  -h, --help   Show help for command

EXAMPLES
  prismic docs nextjs
  prismic docs nextjs#set-up-a-prismic-client

LEARN MORE
  Visit https://prismic.io/docs for the full documentation.
`.trim();

function parsePathAndAnchor(input: string): { path: string; anchor?: string } {
	const hashIndex = input.indexOf("#");
	if (hashIndex === -1) {
		return { path: input };
	}
	return {
		path: input.slice(0, hashIndex),
		anchor: input.slice(hashIndex + 1),
	};
}

async function fetchMarkdown(
	url: string,
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
	try {
		const response = await fetch(url);
		if (response.status === 404) {
			return { ok: false, error: `Documentation not found: ${url}` };
		}
		if (!response.ok) {
			return {
				ok: false,
				error: `Failed to fetch documentation: ${response.status}`,
			};
		}
		const content = await response.text();
		return { ok: true, content };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, error: `Network error: ${message}` };
	}
}

function anchorToHeadingPattern(anchor: string): RegExp {
	// Convert kebab-case anchor to a pattern that matches the heading text
	// Each hyphen/space becomes a flexible match for hyphens or spaces
	const pattern = anchor
		.split("-")
		.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join("[\\s-]+");
	return new RegExp(`^(#{1,6})\\s+${pattern}\\s*$`, "im");
}

function extractSection(
	markdown: string,
	anchor: string,
): { ok: true; content: string } | { ok: false; error: string } {
	const lines = markdown.split("\n");
	const headingPattern = anchorToHeadingPattern(anchor);

	let startIndex = -1;
	let headingLevel = 0;

	// Find the matching heading
	for (let i = 0; i < lines.length; i++) {
		const match = lines[i].match(headingPattern);
		if (match) {
			startIndex = i;
			headingLevel = match[1].length;
			break;
		}
	}

	if (startIndex === -1) {
		return { ok: false, error: `Anchor not found: #${anchor}` };
	}

	// Find the end of this section (next heading of equal or lower level number)
	let endIndex = lines.length;
	for (let i = startIndex + 1; i < lines.length; i++) {
		const headingMatch = lines[i].match(/^(#{1,6})\s/);
		if (headingMatch && headingMatch[1].length <= headingLevel) {
			endIndex = i;
			break;
		}
	}

	const content = lines.slice(startIndex, endIndex).join("\n").trim();
	return { ok: true, content };
}

export async function docs(): Promise<void> {
	const {
		positionals: [pathArg],
		values: { help },
	} = parseArgs({
		args: process.argv.slice(3),
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!pathArg) {
		console.info(HELP);
		return;
	}

	const { path, anchor } = parsePathAndAnchor(pathArg);
	const url = `https://prismic.io/docs/${path}.md`;

	const fetchResult = await fetchMarkdown(url);
	if (!fetchResult.ok) {
		console.error(fetchResult.error);
		process.exitCode = 1;
		return;
	}

	let output = fetchResult.content;

	if (anchor) {
		const extractResult = extractSection(output, anchor);
		if (!extractResult.ok) {
			console.error(extractResult.error);
			process.exitCode = 1;
			return;
		}
		output = extractResult.content;
	}

	console.info(output);
}
