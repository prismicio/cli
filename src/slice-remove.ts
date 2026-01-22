import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { deleteSlice, fetchSlice } from "./lib/custom-types-api";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Remove a slice from the repository.

USAGE
  prismic slice remove <slice-id> [flags]

ARGUMENTS
  slice-id     Slice identifier (required)

FLAGS
  -r, --repo string   Repository domain
  -y                   Confirm removal
      --types string   Generate types to file (default: "prismicio-types.d.ts")
      --no-types       Skip type generation
  -h, --help           Show help for command

EXAMPLES
  prismic slice remove MySlice
  prismic slice remove MySlice -y
  prismic slice remove MySlice --repo my-repo -y
`.trim();

export async function sliceRemove(): Promise<void> {
	const {
		values: { help, y, repo: repoFlag, types, "no-types": noTypes },
		positionals: [sliceId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "remove"
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

	if (!sliceId) {
		console.error("Missing required argument: slice-id\n");
		console.error("Usage: prismic slice remove <slice-id>");
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

	// Verify the slice exists
	const fetchResult = await fetchSlice(repo, sliceId);
	if (!fetchResult.ok) {
		console.error(fetchResult.error);
		process.exitCode = 1;
		return;
	}

	// Require -y flag to confirm deletion
	if (!y) {
		console.error(`Refusing to remove slice "${sliceId}" (this is a destructive action).`);
		console.error("Re-run with -y to confirm.");
		process.exitCode = 1;
		return;
	}

	const deleteResult = await deleteSlice(repo, sliceId);
	if (!deleteResult.ok) {
		console.error(`Failed to remove slice: ${deleteResult.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(`Removed slice "${sliceId}" from repository "${repo}"`);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}
