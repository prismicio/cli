import { parseArgs } from "node:util";

import { isAuthenticated, authenticatedFetch } from "./lib/auth";
import { getInternalApiUrl } from "./lib/urls";
import { getLocales } from "./locale-list";

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

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		console.error("Not logged in. Run `prismic login` first.");
		process.exitCode = 1;
		return;
	}

	try {
		await setDefaultLocale(values.repo, code);
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

async function setDefaultLocale(repo: string, code: string): Promise<void> {
	// First, get the existing locales to find the one we want to set as default
	const locales = await getLocales(repo);
	const locale = locales.find((l) => l.id === code);
	if (!locale) {
		throw new Error(
			`Locale "${code}" not found in repository. Available locales: ${locales.map((l) => l.id).join(", ")}`,
		);
	}

	if (locale.isMaster) {
		throw new Error(`Locale "${code}" is already the default.`);
	}

	const url = new URL("/locale/repository/locales", await getInternalApiUrl());
	url.searchParams.set("repository", repo);
	const response = await authenticatedFetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			id: locale.id,
			label: locale.label,
			customName: locale.customName,
			isMaster: true,
		}),
	});
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`${response.status} ${response.statusText}: ${text}`);
	}
}
