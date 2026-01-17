import { parseArgs } from "node:util";

import { getCredentials, getCookieValue } from "./lib/auth";

export async function localeSetDefault(): Promise<void> {
	const { values, positionals } = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "locale", "set-default"
		options: {
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.info(`Usage: prismic locale set-default <code> --repo <domain>

Set the default locale for a Prismic repository.

Arguments:
  <code>     Locale code (e.g., en-us, fr-fr)

Options:
  -r, --repo   Repository domain (required)
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
		await setDefaultLocale(values.repo, code, credentials.cookies);
		console.info(`Default locale set: ${code}`);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to set default locale: ${error.message}`);
		} else {
			console.error("Failed to set default locale");
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

async function setDefaultLocale(repo: string, code: string, cookies: string[]): Promise<void> {
	// First, get the existing locales to find the one we want to set as default
	const locales = await getLocales(repo, cookies);
	const locale = locales.find((l) => l.id === code);

	if (!locale) {
		throw new Error(`Locale "${code}" not found in repository. Available locales: ${locales.map((l) => l.id).join(", ")}`);
	}

	if (locale.isMaster) {
		throw new Error(`Locale "${code}" is already the default.`);
	}

	const url = new URL("https://api.internal.prismic.io/locale/repository/locales");
	url.searchParams.set("repository", repo);
	const cookieHeader = cookies.join("; ");

	const body = {
		id: locale.id,
		label: locale.label,
		customName: locale.customName,
		isMaster: true,
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
		throw new Error(`${response.status} ${response.statusText}: ${text}`);
	}
}
