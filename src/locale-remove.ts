import { parseArgs } from "node:util";

import { getCredentials } from "./lib/auth";

export async function localeRemove(): Promise<void> {
	const { values, positionals } = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "locale", "remove"
		options: {
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.info(`Usage: prismic locale remove <code> --repo <domain>

Remove a locale from a Prismic repository.

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

	const url = new URL(`https://api.internal.prismic.io/locale/repository/locales/${code}`);
	url.searchParams.set("repository", values.repo);
	const cookieHeader = credentials.cookies.join("; ");

	const response = await fetch(url, {
		method: "DELETE",
		headers: {
			Cookie: cookieHeader,
		},
	});

	if (!response.ok) {
		const text = await response.text();
		console.error(`Failed to remove locale: ${response.status} ${response.statusText}`);
		if (text) {
			console.error(text);
		}
		process.exitCode = 1;
		return;
	}

	console.info(`Removed locale: ${code}`);
}
