import { getHost, getToken } from "../auth";
import { setSimulatorUrl } from "../clients/core";
import { CommandError, parseCommand } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const HELP = `
Set the slice simulator URL for a Prismic repository.

If the URL pathname does not end with /slice-simulator, it is appended
automatically.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic preview set-simulator <url> [flags]

ARGUMENTS
  <url>   Simulator URL (e.g. https://example.com/slice-simulator)

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

EXAMPLES
  prismic preview set-simulator https://my-site.com
  prismic preview set-simulator http://localhost:3000/slice-simulator

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function previewSetSimulator(): Promise<void> {
	const {
		values: { repo = await getRepositoryName() },
		positionals: [urlArg],
	} = parseCommand({
		help: HELP,
		argv: process.argv.slice(4),
		options: {
			repo: { type: "string", short: "r" },
		},
		allowPositionals: true,
	});

	if (!urlArg) {
		throw new CommandError("Missing required argument: <url>");
	}

	let parsed: URL;
	try {
		parsed = new URL(urlArg);
	} catch {
		throw new CommandError(`Invalid URL: ${urlArg}`);
	}

	if (!parsed.pathname.endsWith("/slice-simulator")) {
		parsed.pathname =
			parsed.pathname.replace(/\/+$/, "") + "/slice-simulator";
	}
	const simulatorUrl = parsed.toString();

	const token = await getToken();
	const host = await getHost();

	try {
		await setSimulatorUrl(simulatorUrl, { repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to set simulator URL: ${message}`);
		}
		throw error;
	}

	console.info(`Simulator URL set: ${simulatorUrl}`);
}
