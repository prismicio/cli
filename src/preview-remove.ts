import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";
import { getPreviews } from "./preview-list";

const HELP = `
Remove a preview configuration from a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic preview remove <url> [flags]

ARGUMENTS
  <url>   Preview URL to remove

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function previewRemove(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig() },
		positionals: [previewUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "preview", "remove"
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

	const response = await removePreview(repo, preview.id);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to remove preview: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(`Preview removed: ${previewUrl}`);
}

async function removePreview(repo: string, id: string) {
	const url = new URL(`/previews/delete/${id}`, await getRepoUrl(repo));
	return await request(url, {
		method: "POST",
		body: {},
	});
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
