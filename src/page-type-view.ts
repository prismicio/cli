import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemotePageType } from "./lib/custom-types-api";

const HELP = `
View details of a specific page type.

USAGE
  prismic page-type view <type-id> [flags]

ARGUMENTS
  type-id      Page type identifier (required)

FLAGS
  -r, --repo string   Repository domain
      --json          Output as JSON
  -h, --help          Show help for command

EXAMPLES
  prismic page-type view homepage
  prismic page-type view homepage --json
  prismic page-type view homepage --repo my-repo
`.trim();

export async function pageTypeView(): Promise<void> {
	const {
		values: { help, json, repo: repoFlag },
		positionals: [typeId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "view"
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

	if (!typeId) {
		console.error("Missing required argument: type-id\n");
		console.error("Usage: prismic page-type view <type-id>");
		process.exitCode = 1;
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

	const result = await fetchRemotePageType(repo, typeId);
	if (!result.ok) {
		console.error(result.error);
		process.exitCode = 1;
		return;
	}

	const model = result.value;

	if (json) {
		console.info(JSON.stringify(model, null, 2));
		return;
	}

	console.info(`ID:         ${model.id}`);
	console.info(`Label:      ${model.label}`);
	console.info(`Repeatable: ${model.repeatable}`);

	const tabs = Object.entries(model.json);
	console.info(`\nTabs (${tabs.length}):`);
	for (const [tabName, tabFields] of tabs) {
		const fieldCount = Object.keys(tabFields).length;
		console.info(`  - ${tabName}: ${fieldCount} fields`);
	}
}
