import { parseArgs } from "node:util";

import { getHost, getToken } from "../auth";
import { setSimulatorUrl } from "../clients/preview";
import { UnknownRequestError } from "../lib/request";
import { safeGetRepositoryName } from "../project";

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
		values: { help, repo = await safeGetRepositoryName() },
		positionals: [urlArg],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "preview", "set-simulator"
		options: {
			repo: { type: "string", short: "r" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!urlArg) {
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
		parsed = new URL(urlArg);
	} catch {
		console.error(`Invalid URL: ${urlArg}`);
		process.exitCode = 1;
		return;
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
			console.error(`Failed to set simulator URL: ${message}`);
			process.exitCode = 1;
			return;
		}
		throw error;
	}

	console.info(`Simulator URL set: ${simulatorUrl}`);
}
