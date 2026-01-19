import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, type ParsedRequestResponse, request } from "./lib/request";
import { getInternalApiUrl } from "./lib/url";

const HELP = `
Usage: prismic locale list --repo <domain>

List all locales in a Prismic repository.

Options:
  -r, --repo   Repository domain (required)
      --json   Output as JSON
  -h, --help   Show this help message
`.trim();

export async function localeList(): Promise<void> {
	const {
		values: { help, repo, json },
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
		console.error("Missing required option: --repo");
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
				`Failed to list locales: Invalid response: ${JSON.stringify(response.error.issues)}`,
			);
			process.exitCode = 1;
		} else {
			console.error(`Failed to list locales: ${response.value}`);
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

function handleUnauthenticated(): void {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
