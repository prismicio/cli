import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, type ParsedRequestResponse, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";

const HELP = `
List all preview configurations in a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic preview list [flags]

FLAGS
  -r, --repo string   Repository domain
      --json          Output as JSON
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function previewList(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig(), json },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "preview", "list"
		options: {
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
			json: { type: "boolean" },
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

	const response = await getPreviews(repo);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else if (v.isValiError(response.error)) {
			console.error(
				`Failed to list previews: Invalid response: ${stringify(response.error.issues)}`,
			);
			process.exitCode = 1;
		} else {
			console.error(`Failed to list previews: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	const previews = response.value.results;
	if (json) {
		console.info(stringify(previews));
	} else {
		for (const preview of previews) {
			console.info(`${preview.url}  ${preview.label}`);
		}
	}
}

const PreviewSchema = v.object({
	id: v.string(),
	label: v.string(),
	url: v.string(),
});
export type Preview = v.InferOutput<typeof PreviewSchema>;

const GetPreviewsResponseSchema = v.object({
	results: v.array(PreviewSchema),
});
type GetPreviewsResponse = v.InferOutput<typeof GetPreviewsResponseSchema>;

export async function getPreviews(
	repo: string,
): Promise<ParsedRequestResponse<GetPreviewsResponse>> {
	const url = new URL("/core/repository/preview_configs", await getRepoUrl(repo));
	return await request(url, { schema: GetPreviewsResponseSchema });
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
