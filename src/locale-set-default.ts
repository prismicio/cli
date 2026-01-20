import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getInternalApiUrl } from "./lib/url";
import { type Locale, getLocales } from "./locale-list";

const HELP = `
Set the default locale for a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic locale set-default <code> [flags]

ARGUMENTS
  <code>   Locale code (e.g. en-us, fr-fr)

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function localeSetDefault(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig() },
		positionals: [code],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "locale", "set-default"
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
		console.error("Missing prismic.config.json or --repo option");
		process.exitCode = 1;
		return;
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		handleUnauthenticated();
		return;
	}

	const localesResponse = await getLocales(repo);
	if (!localesResponse.ok) {
		if (localesResponse.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else if (v.isValiError(localesResponse.error)) {
			console.error(
				`Failed to set default locale: Invalid response: ${stringify(localesResponse.error.issues)}`,
			);
			process.exitCode = 1;
		} else {
			console.error(`Failed to set default locale: ${stringify(localesResponse.value)}`);
			process.exitCode = 1;
		}

		return;
	}

	const locales = localesResponse.value.results;
	const locale = locales.find((l) => l.id === code);
	if (!locale) {
		console.error(
			`Locale "${code}" not found in repository. Available locales: ${locales.map((l) => l.id).join(", ")}`,
		);
		process.exitCode = 1;
		return;
	}

	if (locale.isMaster) {
		console.error(`Locale "${code}" is already the default.`);
		process.exitCode = 1;
		return;
	}

	const response = await setDefaultLocale(repo, locale);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to set default locale: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(`Default locale set: ${code}`);
}

async function setDefaultLocale(repo: string, locale: Locale) {
	const url = new URL("/locale/repository/locales", await getInternalApiUrl());
	url.searchParams.set("repository", repo);
	return await request(url, {
		method: "POST",
		body: {
			id: locale.id,
			label: locale.label,
			customName: locale.customName,
			isMaster: true,
		},
	});
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
