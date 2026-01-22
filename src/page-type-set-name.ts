import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemotePageType, updateCustomType } from "./lib/custom-types-api";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Change a page type's display name (label).

USAGE
  prismic page-type set-name <type-id> <new-name> [flags]

ARGUMENTS
  type-id      Page type identifier (required)
  new-name     New display name (required)

FLAGS
  -r, --repo string   Repository domain
      --types string  Generate types to file (default: "prismicio-types.d.ts")
      --no-types      Skip type generation
  -h, --help          Show help for command

EXAMPLES
  prismic page-type set-name homepage "Home Page"
  prismic page-type set-name blog_post "Blog Post"
  prismic page-type set-name homepage "Home Page" --repo my-repo
`.trim();

export async function pageTypeSetName(): Promise<void> {
	const {
		values: { help, repo: repoFlag, types, "no-types": noTypes },
		positionals: [typeId, newName],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "set-name"
		options: {
			repo: { type: "string", short: "r" },
			types: { type: "string" },
			"no-types": { type: "boolean" },
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
		console.error("Usage: prismic page-type set-name <type-id> <new-name>");
		process.exitCode = 1;
		return;
	}

	if (!newName) {
		console.error("Missing required argument: new-name\n");
		console.error("Usage: prismic page-type set-name <type-id> <new-name>");
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

	const fetchResult = await fetchRemotePageType(repo, typeId);
	if (!fetchResult.ok) {
		console.error(fetchResult.error);
		process.exitCode = 1;
		return;
	}

	const model = fetchResult.value;
	model.label = newName;

	const updateResult = await updateCustomType(repo, model);
	if (!updateResult.ok) {
		console.error(`Failed to update page type: ${updateResult.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(`Renamed page type "${typeId}" to "${newName}"`);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}
