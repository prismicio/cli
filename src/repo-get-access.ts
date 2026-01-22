import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";

const SyncStateSchema = v.object({
	repository: v.object({
		api_access: v.string(),
	}),
});

const HELP = `
Get the Content API access level of a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic repo get-access [flags]

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function repoGetAccess(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig() },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "repo", "get-access"
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

	const response = await getRepositoryAccess(repo);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to get repository access: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(response.value.repository.api_access);
}

async function getRepositoryAccess(domain: string) {
	const repoUrl = await getRepoUrl(domain);
	const url = new URL("syncState", repoUrl);

	return await request(url, { schema: SyncStateSchema });
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
