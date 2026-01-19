import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoDashboardUrl } from "./lib/urls";

const HELP = `
Usage: prismic locale add <code> --repo <domain> [--name "Display Name"]

Add a new locale to a Prismic repository.

Arguments:
  <code>     Locale code (e.g., fr-fr, es-es)

Options:
  -r, --repo   Repository domain (required)
  -n, --name   Custom display name (creates custom locale)
  -h, --help   Show this help message
`.trim();

export async function localeAdd(): Promise<void> {
	const {
		values: { help, name, repo },
		positionals: [code],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "locale", "add"
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

	const response = name
		? await addCustomLocale(repo, code, name)
		: await addStandardLocale(repo, code);
	if (!response.ok) {
		if (
			typeof response.value === "string" &&
			response.value.includes("already existing languages")
		) {
			// Treat as success
			return;
		}

		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to add locale: ${response.value}`);
			process.exitCode = 1;
		}

		return;
	}

	console.info(`Locale added: ${code}`);
}

async function addStandardLocale(repo: string, code: string) {
	const url = new URL("/app/settings/multilanguages", await getRepoDashboardUrl(repo));
	return await request(url, {
		method: "POST",
		body: { languages: [code] },
	});
}

async function addCustomLocale(repo: string, code: string, name: string) {
	const [langPart, regionPart] = code.split("-");
	const url = new URL("/app/settings/multilanguages/custom", await getRepoDashboardUrl(repo));
	return await request(url, {
		method: "POST",
		body: {
			lang: { label: name, id: langPart || code },
			region: { label: name, id: regionPart || langPart || code },
		},
	});
}

function handleUnauthenticated(): void {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
