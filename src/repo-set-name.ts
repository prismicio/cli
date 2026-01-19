import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";

const HELP = `
Usage: prismic repo set-name <name> --repo <domain>

Set the display name of a Prismic repository.

Arguments:
  <name>       The new display name for the repository

Options:
  -r, --repo   Repository domain (required)
  -h, --help   Show this help message
`.trim();

export async function repoSetName(): Promise<void> {
	const {
		values: { help, repo },
		positionals: [displayName],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "repo", "set-name"
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

	if (!displayName) {
		console.error("Missing required argument: <name>");
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

	const response = await setRepositoryName(repo, displayName);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else if (v.isValiError(response.error)) {
			console.error(
				`Failed to set repository name: Invalid response: ${stringify(response.error.issues)}`,
			);
			process.exitCode = 1;
		} else {
			console.error(`Failed to set repository name: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(`Repository name set to: ${response.value.repository.name}`);
}

async function setRepositoryName(domain: string, displayName: string) {
	const repoUrl = await getRepoUrl(domain);
	const url = new URL("app/settings/repository", repoUrl);

	const formData = new FormData();
	formData.set("displayname", displayName);

	return await request(url, {
		method: "POST",
		body: formData,
		schema: v.object({ repository: v.object({ name: v.string() }) }),
	});
}

function handleUnauthenticated(): void {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
