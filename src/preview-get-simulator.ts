import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, type ParsedRequestResponse, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";

const HELP = `
Show the slice simulator URL for a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic preview get-simulator [flags]

FLAGS
      --json          Output as JSON
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function previewGetSimulator(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig(), json },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "preview", "get-simulator"
		options: {
			json: { type: "boolean" },
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

	const response = await getSimulatorUrl(repo);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else if (v.isValiError(response.error)) {
			console.error(
				`Failed to get simulator URL: Invalid response: ${stringify(response.error.issues)}`,
			);
			process.exitCode = 1;
		} else {
			console.error(`Failed to get simulator URL: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	const simulatorUrl = response.value.simulator_url;
	if (!simulatorUrl) {
		if (json) {
			console.info(stringify({ simulator_url: null }));
		} else {
			console.info("No simulator URL configured.");
		}
		return;
	}

	if (json) {
		console.info(stringify({ simulator_url: simulatorUrl }));
	} else {
		console.info(simulatorUrl);
	}
}

const RepositoryResponseSchema = v.object({
	simulator_url: v.optional(v.string()),
});
type RepositoryResponse = v.InferOutput<typeof RepositoryResponseSchema>;

async function getSimulatorUrl(
	repo: string,
): Promise<ParsedRequestResponse<RepositoryResponse>> {
	const url = new URL("/core/repository", await getRepoUrl(repo));
	return await request(url, { schema: RepositoryResponseSchema });
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
