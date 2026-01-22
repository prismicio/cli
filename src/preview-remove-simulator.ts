import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";

const HELP = `
Remove the slice simulator URL from a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic preview remove-simulator [flags]

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function previewRemoveSimulator(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig() },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "preview", "remove-simulator"
		options: {
			repo: { type: "string", short: "r" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: false,
	});

	if (help) {
		console.info(HELP);
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

	const response = await removeSimulatorUrl(repo);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to remove simulator URL: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info("Simulator URL removed.");
}

async function removeSimulatorUrl(repo: string) {
	const url = new URL("/core/repository", await getRepoUrl(repo));
	return await request(url, {
		method: "PATCH",
		body: { simulator_url: "" },
	});
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
