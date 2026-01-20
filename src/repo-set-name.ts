import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";

const HELP = `
Set the display name of a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic repo set-name <name> [flags]

ARGUMENTS
  <name>   The new display name for the repository

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function repoSetName(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig() },
		positionals: [displayName],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "repo", "set-name"
		options: {
			repo: { type: "string", short: "r" },
			help: { type: "boolean", short: "h" },
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
		console.error("Missing prismic.config.json or --repo option");
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

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
