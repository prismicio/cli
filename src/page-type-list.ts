import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemotePageTypes } from "./lib/custom-types-api";

const HELP = `
List all page types in a Prismic repository.

USAGE
  prismic page-type list [flags]

FLAGS
  -r, --repo string   Repository domain
      --json          Output as JSON
  -h, --help          Show help for command

EXAMPLES
  prismic page-type list
  prismic page-type list --json
  prismic page-type list --repo my-repo
`.trim();

export async function pageTypeList(): Promise<void> {
	const {
		values: { help, json, repo: repoFlag },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "list"
		options: {
			repo: { type: "string", short: "r" },
			json: { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	const repo = repoFlag ?? (await safeGetRepositoryFromConfig());
	if (!repo) {
		console.error("Missing prismic.config.json or --repo option");
		process.exitCode = 1;
		return;
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		console.error("Not logged in. Run `prismic login` first.");
		process.exitCode = 1;
		return;
	}

	const result = await fetchRemotePageTypes(repo);
	if (!result.ok) {
		console.error(result.error);
		process.exitCode = 1;
		return;
	}

	const pageTypes = result.value;

	if (pageTypes.length === 0) {
		if (json) {
			console.info(JSON.stringify([]));
		} else {
			console.info("No page types found.");
		}
		return;
	}

	if (json) {
		console.info(
			JSON.stringify(
				pageTypes.map((pt) => ({
					id: pt.id,
					label: pt.label,
					repeatable: pt.repeatable,
				})),
				null,
				2,
			),
		);
	} else {
		console.info("ID\tLABEL\tTYPE");
		for (const pageType of pageTypes) {
			const typeLabel = pageType.repeatable ? "repeatable" : "singleton";
			console.info(`${pageType.id}\t${pageType.label}\t${typeLabel}`);
		}
	}
}
