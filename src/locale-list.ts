import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, type ParsedRequestResponse, request } from "./lib/request";
import { getInternalApiUrl } from "./lib/url";

const HELP = `
List all locales in a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic locale list [flags]

FLAGS
  -r, --repo string   Repository domain
      --json          Output as JSON
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function localeList(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig(), json },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "locale", "list"
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

	const response = await getLocales(repo);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else if (v.isValiError(response.error)) {
			console.error(
				`Failed to list locales: Invalid response: ${stringify(response.error.issues)}`,
			);
			process.exitCode = 1;
		} else {
			console.error(`Failed to list locales: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	const locales = response.value.results;
	if (json) {
		console.info(stringify(locales));
	} else {
		for (const locale of locales) {
			const defaultLabel = locale.isMaster ? " (default)" : "";
			console.info(`${locale.id}  ${locale.label}${defaultLabel}`);
		}
	}
}

const LocaleSchema = v.object({
	id: v.string(),
	label: v.string(),
	customName: v.nullable(v.string()),
	isMaster: v.boolean(),
});
export type Locale = v.InferOutput<typeof LocaleSchema>;

const GetLocalesResponseSchema = v.object({
	results: v.array(LocaleSchema),
});
type GetLocalesResponse = v.InferOutput<typeof GetLocalesResponseSchema>;

export async function getLocales(repo: string): Promise<ParsedRequestResponse<GetLocalesResponse>> {
	const url = new URL("/locale/repository/locales", await getInternalApiUrl());
	url.searchParams.set("repository", repo);
	return await request(url, { schema: GetLocalesResponseSchema });
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
