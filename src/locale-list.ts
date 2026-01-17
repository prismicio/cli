import { parseArgs } from "node:util";

import { getCredentials, getCookieValue } from "./lib/auth";

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
		console.info(`Usage: prismic locale list --repo <domain>

List all locales in a Prismic repository.

Options:
  -r, --repo   Repository domain (required)
      --json   Output as JSON
  -h, --help   Show this help message`);

		return;
	}

	if (!values.repo) {
		console.error("Missing required option: --repo");
		process.exitCode = 1;

		return;
	}

	const credentials = await getCredentials();

	if (!credentials) {
		console.error("Not logged in. Run `prismic login` first.");
		process.exitCode = 1;

		return;
	}

	const authToken = getCookieValue(credentials.cookies, "prismic-auth");
	if (!authToken) {
		console.error("Invalid credentials. Run `prismic login` first.");
		process.exitCode = 1;

		return;
	}

	try {
		const locales = await getLocales(values.repo, credentials.cookies);

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

interface Locale {
	id: string;
	label: string;
	customName: string | null;
	isMaster: boolean;
}

async function getLocales(repo: string, cookies: string[]): Promise<Locale[]> {
	const url = new URL("https://api.internal.prismic.io/locale/repository/locales");
	url.searchParams.set("repository", repo);
	const cookieHeader = cookies.join("; ");

	const response = await fetch(url, {
		method: "GET",
		headers: {
			Cookie: cookieHeader,
		},
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`${response.status} ${response.statusText}: ${text}`);
	}

	const data = await response.json();

	if (data.results && Array.isArray(data.results)) {
		return data.results;
	}

	throw new Error(`Unexpected response format: ${JSON.stringify(data)}`);
}
