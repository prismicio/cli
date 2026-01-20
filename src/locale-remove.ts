import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getInternalApiUrl } from "./lib/url";

const HELP = `
Remove a locale from a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic locale remove <code> [flags]

ARGUMENTS
  <code>   Locale code (e.g. en-us, fr-fr)

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function localeRemove(): Promise<void> {
	const {
		values: { repo = await safeGetRepositoryFromConfig(), help },
		positionals: [code],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "locale", "remove"
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

	if (!code) {
		console.error("Missing required argument: <code>");
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

	const response = await removeLocale(repo, code);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to remove locale: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(`Removed locale: ${code}`);
}

async function removeLocale(repository: string, code: string) {
	const url = new URL(`/locale/repository/locales/${code}`, await getInternalApiUrl());
	url.searchParams.set("repository", repository);
	return await request(url, { method: "DELETE" });
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
