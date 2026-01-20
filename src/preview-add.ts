import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";

const HELP = `
Add a preview configuration to a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic preview add <url> [flags]

ARGUMENTS
  <url>   Preview URL (e.g. https://example.com/api/preview)

FLAGS
  -n, --name string   Display name (defaults to hostname)
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function previewAdd(): Promise<void> {
	const {
		values: { help, name, repo = await safeGetRepositoryFromConfig() },
		positionals: [previewUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "preview", "add"
		options: {
			name: { type: "string", short: "n" },
			repo: { type: "string", short: "r" },
			help: { type: "boolean", short: "h" },
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
		console.error("Missing prismic.config.json or --repo option");
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
