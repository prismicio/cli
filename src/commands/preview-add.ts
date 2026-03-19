import { parseArgs } from "node:util";

import { getHost, getToken } from "../auth";
import { addPreview } from "../clients/preview";
import { UnknownRequestError } from "../lib/request";
import { safeGetRepositoryName } from "../project";

const HELP = `
Add a preview configuration to a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic preview add <url> [flags]

ARGUMENTS
  <url>   Preview URL (e.g. https://example.com/api/preview)

FLAGS
  -n, --name string   Display name (defaults to hostname)
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function previewAdd(): Promise<void> {
	const {
		values: { help, name, repo = await safeGetRepositoryName() },
		positionals: [previewUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "preview", "add"
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

	if (!previewUrl) {
		console.error("Missing required argument: <url>");
		process.exitCode = 1;
		return;
	}

	if (!repo) {
		console.error("Missing prismic.config.json or --repo option");
		process.exitCode = 1;
		return;
	}

	let parsed: URL;
	try {
		parsed = new URL(previewUrl);
	} catch {
		console.error(`Invalid URL: ${previewUrl}`);
		process.exitCode = 1;
		return;
	}

	const displayName = name || parsed.hostname;
	const websiteURL = `${parsed.protocol}//${parsed.host}`;
	const resolverPath =
		parsed.pathname === "/" ? undefined : parsed.pathname;

	const token = await getToken();
	const host = await getHost();

	try {
		await addPreview(
			{ name: displayName, websiteURL, resolverPath },
			{ repo, token, host },
		);
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			console.error(`Failed to add preview: ${message}`);
			process.exitCode = 1;
			return;
		}
		throw error;
	}

	console.info(`Preview added: ${previewUrl}`);
}
