import { getHost, getToken } from "../auth";
import { addPreview } from "../clients/core";
import { CommandError, parseCommand } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

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
		values: { repo = await getRepositoryName(), name },
		positionals: [previewUrl],
	} = parseCommand({
		help: HELP,
		argv: process.argv.slice(4),
		options: {
			name: { type: "string", short: "n" },
			repo: { type: "string", short: "r" },
		},
		allowPositionals: true,
	});

	if (!previewUrl) {
		throw new CommandError("Missing required argument: <url>");
	}

	let parsed: URL;
	try {
		parsed = new URL(previewUrl);
	} catch {
		throw new CommandError(`Invalid URL: ${previewUrl}`);
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
			throw new CommandError(`Failed to add preview: ${message}`);
		}
		throw error;
	}

	console.info(`Preview added: ${previewUrl}`);
}
