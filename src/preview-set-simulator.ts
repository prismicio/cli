import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";

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
		values: { help, repo = await safeGetRepositoryFromConfig() },
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

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		handleUnauthenticated();
		return;
	}

	const simulatorUrl = normalizeSimulatorUrl(urlArg);
	if (!simulatorUrl) {
		console.error(`Invalid URL: ${urlArg}`);
		process.exitCode = 1;
		return;
	}

	const response = await setSimulatorUrl(repo, simulatorUrl);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to set simulator URL: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(`Simulator URL set: ${simulatorUrl}`);
}

export function normalizeSimulatorUrl(url: string): string | undefined {
	try {
		const parsed = new URL(url);
		if (!parsed.pathname.endsWith("/slice-simulator")) {
			parsed.pathname = parsed.pathname.replace(/\/+$/, "") + "/slice-simulator";
		}
		return parsed.toString();
	} catch {
		return undefined;
	}
}

async function setSimulatorUrl(repo: string, simulatorUrl: string) {
	const url = new URL("/core/repository", await getRepoUrl(repo));
	return await request(url, {
		method: "PATCH",
		body: { simulator_url: simulatorUrl },
	});
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
