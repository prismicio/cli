import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";
import { parsePreviewUrl } from "./preview-add";
import { getPreviews } from "./preview-list";

const HELP = `
Update the name of a preview configuration.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic preview set-name <url> <name> [flags]

ARGUMENTS
  <url>    Preview URL to update
  <name>   New display name

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function previewSetName(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig() },
		positionals: [previewUrl, name],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "preview", "set-name"
		options: {
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
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

	if (!name) {
		console.error("Missing required argument: <name>");
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

	const previewsResponse = await getPreviews(repo);
	if (!previewsResponse.ok) {
		if (previewsResponse.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to fetch previews: ${stringify(previewsResponse.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	const preview = previewsResponse.value.results.find((p) => p.url === previewUrl);
	if (!preview) {
		console.error(`Preview not found: ${previewUrl}`);
		process.exitCode = 1;
		return;
	}

	const response = await updatePreview(repo, preview.id, {
		name,
		websiteURL: parsed.websiteURL,
		resolverPath: parsed.resolverPath,
	});

	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to update preview: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(`Preview updated: ${previewUrl}`);
}

async function updatePreview(
	repo: string,
	id: string,
	config: { name: string; websiteURL: string; resolverPath: string | undefined },
) {
	const url = new URL(`/previews/save/${id}`, await getRepoUrl(repo));
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
