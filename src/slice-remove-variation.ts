import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchSlice, updateSlice } from "./lib/custom-types-api";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Remove a variation from a slice.

USAGE
  prismic slice remove-variation <slice-id> <variation-id> [flags]

ARGUMENTS
  slice-id       Slice identifier (required)
  variation-id   Variation to remove (required)

FLAGS
  -r, --repo string   Repository domain
      --types string  Generate types to file (default: "prismicio-types.d.ts")
      --no-types      Skip type generation
  -h, --help          Show help for command

EXAMPLES
  prismic slice remove-variation MySlice withImage
  prismic slice remove-variation MySlice withImage --repo my-repo
`.trim();

export async function sliceRemoveVariation(): Promise<void> {
	const {
		values: { help, repo: repoFlag, types, "no-types": noTypes },
		positionals: [sliceId, variationId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "remove-variation"
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
		console.error("Usage: prismic slice remove-variation <slice-id> <variation-id>");
		process.exitCode = 1;
		return;
	}

	if (!variationId) {
		console.error("Missing required argument: variation-id\n");
		console.error("Usage: prismic slice remove-variation <slice-id> <variation-id>");
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

	// Check if variation exists
	const variationExists = model.variations.some((v) => v.id === variationId);
	if (!variationExists) {
		console.error(`Variation not found: ${variationId}`);
		console.error(`Available variations: ${model.variations.map((v) => v.id).join(", ")}`);
		process.exitCode = 1;
		return;
	}

	// Prevent removing the last variation
	if (model.variations.length === 1) {
		console.error("Cannot remove the last variation from a slice.");
		process.exitCode = 1;
		return;
	}

	// Remove the variation
	const updatedModel = {
		...model,
		variations: model.variations.filter((v) => v.id !== variationId),
	};

	const updateResult = await updateSlice(repo, updatedModel as SharedSlice);
	if (!updateResult.ok) {
		console.error(`Failed to update slice: ${updateResult.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(`Removed variation "${variationId}" from slice "${sliceId}"`);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}
