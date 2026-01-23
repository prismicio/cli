import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";

const VALID_LEVELS = ["private", "public", "open"] as const;

const HELP = `
Set the Content API access level of a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic repo set-access <level> [flags]

ARGUMENTS
  <level>   The access level to set (private, public, open)

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function repoSetAccess(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig() },
		positionals: [level],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "repo", "set-access"
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

	if (!level) {
		console.error("Missing required argument: <level>");
		process.exitCode = 1;
		return;
	}

	if (!VALID_LEVELS.includes(level as (typeof VALID_LEVELS)[number])) {
		console.error(`Invalid access level: ${level}. Must be one of: ${VALID_LEVELS.join(", ")}`);
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

	const response = await setRepositoryAccess(repo, level);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to set repository access: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(`Repository access set to: ${level}`);
}

async function setRepositoryAccess(domain: string, level: string) {
	const repoUrl = await getRepoUrl(domain);
	const url = new URL("settings/security/apiaccess", repoUrl);

	return await request(url, {
		method: "POST",
		body: { api_access: level },
	});
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
