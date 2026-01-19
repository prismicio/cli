import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { ForbiddenRequestError, request } from "./lib/request";
import { getInternalApiUrl } from "./lib/urls";

const HELP = `
Usage: prismic locale remove <code> --repo <domain>

Remove a locale from a Prismic repository.

Arguments:
  <code>     Locale code (e.g., en-us, fr-fr)

Options:
  -r, --repo   Repository domain (required)
  -h, --help   Show this help message
`.trim();

export async function localeRemove(): Promise<void> {
	const {
		values: { repo, help },
		positionals: [code],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "locale", "remove"
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

	if (!code) {
		console.error("Missing required argument: <code>");
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

	const response = await removeLocale(repo, code);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to remove locale: ${response.value}`);
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
