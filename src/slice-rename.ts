import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchSlice, updateSlice } from "./lib/custom-types-api";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Rename a slice (updates the display name).

USAGE
  prismic slice rename <slice-id> <new-name> [flags]

ARGUMENTS
  slice-id     Slice identifier (required)
  new-name     New display name (required)

FLAGS
  -r, --repo string   Repository domain
      --types string  Generate types to file (default: "prismicio-types.d.ts")
      --no-types      Skip type generation
  -h, --help          Show help for command

EXAMPLES
  prismic slice rename MySlice "My New Name"
  prismic slice rename MySlice "My New Name" --repo my-repo
`.trim();

export async function sliceRename(): Promise<void> {
	const {
		values: { help, repo: repoFlag, types, "no-types": noTypes },
		positionals: [sliceId, newName],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "rename"
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

	if (!sliceId) {
		console.error("Missing required argument: slice-id\n");
		console.error("Usage: prismic slice rename <slice-id> <new-name>");
		process.exitCode = 1;
		return;
	}

	if (!newName) {
		console.error("Missing required argument: new-name\n");
		console.error("Usage: prismic slice rename <slice-id> <new-name>");
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

	const fetchResult = await fetchSlice(repo, sliceId);
	if (!fetchResult.ok) {
		console.error(fetchResult.error);
		process.exitCode = 1;
		return;
	}

	const model = fetchResult.value;

	// Update the name
	const updatedModel = { ...model, name: newName };

	const updateResult = await updateSlice(repo, updatedModel);
	if (!updateResult.ok) {
		console.error(`Failed to update slice: ${updateResult.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(`Renamed slice "${sliceId}" to "${newName}"`);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}
