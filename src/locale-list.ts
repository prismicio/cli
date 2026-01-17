import { parseArgs } from "node:util";

import { authenticatedFetch, isAuthenticated } from "./lib/auth";
import { getInternalApiUrl } from "./lib/urls";

export async function localeList(): Promise<void> {
	const { values } = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "locale", "list"
		options: {
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
			json: { type: "boolean" },
		},
		allowPositionals: false,
	});

	if (values.help) {
		console.info(
			`
Usage: prismic locale list --repo <domain>

List all locales in a Prismic repository.

Options:
  -r, --repo   Repository domain (required)
      --json   Output as JSON
  -h, --help   Show this help message
`.trim(),
		);
		return;
	}

	if (!values.repo) {
		console.error("Missing required option: --repo");
		process.exitCode = 1;
		return;
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		console.error("Not logged in. Run `prismic login` first.");
		process.exitCode = 1;
		return;
	}

	try {
		const locales = await getLocales(values.repo);

		if (values.json) {
			console.info(JSON.stringify(locales, null, 2));
		} else {
			for (const locale of locales) {
				const defaultLabel = locale.isMaster ? " (default)" : "";
				console.info(`${locale.id}  ${locale.label}${defaultLabel}`);
			}
		}
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to list locales: ${error.message}`);
		} else {
			console.error("Failed to list locales");
		}
		process.exitCode = 1;
	}
}

type Locale = {
	id: string;
	label: string;
	customName: string | null;
	isMaster: boolean;
};

export async function getLocales(repo: string): Promise<Locale[]> {
	const url = new URL("/locale/repository/locales", await getInternalApiUrl());
	url.searchParams.set("repository", repo);
	const response = await authenticatedFetch(url, { method: "GET" });
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`${response.status} ${response.statusText}: ${text}`);
	}

	const json = await response.json();
	if (json.results && Array.isArray(json.results)) {
		return json.results;
	}

	throw new Error(`Unexpected response format: ${JSON.stringify(json)}`);
}
