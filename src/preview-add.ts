import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";

const HELP = `
Usage: prismic preview add <url> --repo <domain> [--name "Name"]

Add a preview configuration to a Prismic repository.

Arguments:
  <url>        Preview URL (e.g., https://example.com/api/preview)

Options:
  -r, --repo   Repository domain (required)
  -n, --name   Display name (defaults to hostname)
  -h, --help   Show this help message
`.trim();

export async function previewAdd(): Promise<void> {
	const {
		values: { help, name, repo },
		positionals: [previewUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "preview", "add"
		options: {
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
			name: { type: "string", short: "n" },
		},
		allowPositionals: true,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!previewUrl) {
		console.error("Missing required argument: <url>");
		process.exitCode = 1;
		return;
	}

	if (!repo) {
		console.error("Missing required option: --repo");
		process.exitCode = 1;
		return;
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		handleUnauthenticated();
		return;
	}

	const parsed = parsePreviewUrl(previewUrl);
	if (!parsed) {
		console.error(`Invalid URL: ${previewUrl}`);
		process.exitCode = 1;
		return;
	}

	const displayName = name || parsed.hostname;

	const response = await addPreview(repo, {
		name: displayName,
		websiteURL: parsed.websiteURL,
		resolverPath: parsed.resolverPath,
	});

	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to add preview: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(`Preview added: ${previewUrl}`);
}

export function parsePreviewUrl(
	url: string,
): { websiteURL: string; resolverPath: string | undefined; hostname: string } | undefined {
	try {
		const parsed = new URL(url);
		const websiteURL = `${parsed.protocol}//${parsed.host}`;
		const resolverPath = parsed.pathname === "/" ? undefined : parsed.pathname;
		return { websiteURL, resolverPath, hostname: parsed.hostname };
	} catch {
		return undefined;
	}
}

async function addPreview(
	repo: string,
	config: { name: string; websiteURL: string; resolverPath: string | undefined },
) {
	const url = new URL("/previews/new", await getRepoUrl(repo));
	return await request(url, {
		method: "POST",
		body: {
			name: config.name,
			websiteURL: config.websiteURL,
			resolverPath: config.resolverPath,
		},
	});
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
