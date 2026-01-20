import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";

const HELP = `
Add a new locale to a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic locale add <code> [flags]

ARGUMENTS
  <code>   Locale code (e.g. fr-fr, es-es)

FLAGS
  -n, --name string   Custom display name (creates custom locale)
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function localeAdd(): Promise<void> {
	const {
		values: { help, name, repo = await safeGetRepositoryFromConfig() },
		positionals: [code],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "locale", "add"
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
			console.error(`Failed to add locale: ${stringify(response.value)}`);
			process.exitCode = 1;
		}

		return;
	}

	console.info(`Locale added: ${code}`);
}

async function addStandardLocale(repo: string, code: string) {
	const url = new URL("/app/settings/multilanguages", await getRepoUrl(repo));
	return await request(url, {
		method: "POST",
		body: { languages: [code] },
	});
}

async function addCustomLocale(repo: string, code: string, name: string) {
	const [langPart, regionPart] = code.split("-");
	const url = new URL("/app/settings/multilanguages/custom", await getRepoUrl(repo));
	return await request(url, {
		method: "POST",
		body: {
			lang: { label: name, id: langPart || code },
			region: { label: name, id: regionPart || langPart || code },
		},
	});
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
