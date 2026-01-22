import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { deleteCustomType, fetchRemotePageType } from "./lib/custom-types-api";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Remove a page type from the repository.

USAGE
  prismic page-type remove <type-id> [flags]

ARGUMENTS
  type-id      Page type identifier (required)

FLAGS
  -r, --repo string   Repository domain
  -y                   Confirm removal
      --types string   Generate types to file (default: "prismicio-types.d.ts")
      --no-types       Skip type generation
  -h, --help           Show help for command

EXAMPLES
  prismic page-type remove homepage
  prismic page-type remove homepage -y
  prismic page-type remove homepage --repo my-repo -y
`.trim();

export async function pageTypeRemove(): Promise<void> {
	const {
		values: { help, y, repo: repoFlag, types, "no-types": noTypes },
		positionals: [typeId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "remove"
		options: {
			repo: { type: "string", short: "r" },
			y: { type: "boolean", short: "y" },
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
		console.error("Usage: prismic page-type remove <type-id>");
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

	// Verify the page type exists and is actually a page type
	const fetchResult = await fetchRemotePageType(repo, typeId);
	if (!fetchResult.ok) {
		console.error(fetchResult.error);
		process.exitCode = 1;
		return;
	}

	// Require -y flag to confirm deletion
	if (!y) {
		console.error(`Refusing to remove page type "${typeId}" (this is a destructive action).`);
		console.error("Re-run with -y to confirm.");
		process.exitCode = 1;
		return;
	}

	const deleteResult = await deleteCustomType(repo, typeId);
	if (!deleteResult.ok) {
		console.error(`Failed to remove page type: ${deleteResult.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(`Removed page type "${typeId}" from repository "${repo}"`);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}
