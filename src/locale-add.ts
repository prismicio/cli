import { parseArgs } from "node:util";

import { getCredentials, getCookieValue } from "./lib/auth";

export async function localeAdd(): Promise<void> {
	const { values, positionals } = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "locale", "add"
		options: {
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
			name: { type: "string", short: "n" },
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.info(`Usage: prismic locale add <code> --repo <domain> [--name "Display Name"]

Add a new locale to a Prismic repository.

Arguments:
  <code>     Locale code (e.g., fr-fr, es-es)

Options:
  -r, --repo   Repository domain (required)
  -n, --name   Custom display name (creates custom locale)
  -h, --help   Show this help message`);
		return;
	}

	const code = positionals[0];
	if (!code) {
		console.error("Missing required argument: <code>");
		process.exitCode = 1;
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
		if (values.name) {
			await addCustomLocale(values.repo, code, values.name, credentials.cookies);
		} else {
			await addStandardLocale(values.repo, code, credentials.cookies);
		}
		console.info(`Locale added: ${code}`);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to add locale: ${error.message}`);
		} else {
			console.error("Failed to add locale");
		}
		process.exitCode = 1;
	}
}

async function addStandardLocale(repo: string, code: string, cookies: string[]): Promise<void> {
	const url = new URL(`https://${repo}.prismic.io/app/settings/multilanguages`);
	const cookieHeader = cookies.join("; ");

	const body = { languages: [code] };

	const response = await fetch(url, {
		method: "POST",
		headers: {
			Cookie: cookieHeader,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const text = await response.text();
		// Treat "already existing languages" as success
		if (response.status === 400 && text.includes("already existing languages")) {
			return;
		}
		throw new Error(`${response.status} ${response.statusText}: ${text}`);
	}
}

async function addCustomLocale(
	repo: string,
	code: string,
	name: string,
	cookies: string[]
): Promise<void> {
	const url = new URL(`https://${repo}.prismic.io/app/settings/multilanguages/custom`);
	const cookieHeader = cookies.join("; ");

	// Parse lang and region from code (e.g., "es-mx" -> lang: "es", region: "mx")
	const [langPart, regionPart] = code.split("-");

	const body = {
		lang: {
			label: name,
			id: langPart || code,
		},
		region: {
			label: name,
			id: regionPart || langPart || code,
		},
	};

	const response = await fetch(url, {
		method: "POST",
		headers: {
			Cookie: cookieHeader,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const text = await response.text();
		// Treat "already existing languages" as success
		if (response.status === 400 && text.includes("already existing languages")) {
			return;
		}
		throw new Error(`${response.status} ${response.statusText}: ${text}`);
	}
}
