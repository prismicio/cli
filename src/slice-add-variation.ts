import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchSlice, updateSlice } from "./lib/custom-types-api";
import { pascalCase } from "./lib/slice";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Add a new variation to a slice.

USAGE
  prismic slice add-variation <slice-id> <variation-id> [flags]

ARGUMENTS
  slice-id       Slice identifier (required)
  variation-id   New variation identifier (required)

FLAGS
  -r, --repo string        Repository domain
  --name string            Display name for the variation
  --copy-from string       Copy fields from an existing variation
      --types string       Generate types to file (default: "prismicio-types.d.ts")
      --no-types           Skip type generation
  -h, --help               Show help for command

EXAMPLES
  prismic slice add-variation MySlice withImage
  prismic slice add-variation MySlice withImage --name "With Image"
  prismic slice add-variation MySlice withImage --copy-from default
  prismic slice add-variation MySlice withImage --repo my-repo
`.trim();

export async function sliceAddVariation(): Promise<void> {
	const {
		values: { help, name, "copy-from": copyFrom, repo: repoFlag, types, "no-types": noTypes },
		positionals: [sliceId, variationId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "add-variation"
		options: {
			repo: { type: "string", short: "r" },
			name: { type: "string" },
			"copy-from": { type: "string" },
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
		console.error("Usage: prismic slice add-variation <slice-id> <variation-id>");
		process.exitCode = 1;
		return;
	}

	if (!variationId) {
		console.error("Missing required argument: variation-id\n");
		console.error("Usage: prismic slice add-variation <slice-id> <variation-id>");
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

	// Check if variation already exists
	if (model.variations.some((v) => v.id === variationId)) {
		console.error(`Variation "${variationId}" already exists in slice "${sliceId}"`);
		process.exitCode = 1;
		return;
	}

	// Build new variation
	let newVariation: SharedSlice["variations"][number];

	if (copyFrom) {
		const sourceVariation = model.variations.find((v) => v.id === copyFrom);
		if (!sourceVariation) {
			console.error(`Source variation not found: ${copyFrom}`);
			console.error(`Available variations: ${model.variations.map((v) => v.id).join(", ")}`);
			process.exitCode = 1;
			return;
		}

		newVariation = {
			...structuredClone(sourceVariation),
			id: variationId,
			name: name ?? pascalCase(variationId),
		};
	} else {
		newVariation = {
			id: variationId,
			name: name ?? pascalCase(variationId),
			description: variationId,
			imageUrl: "",
			docURL: "",
			version: "initial",
			primary: {},
			items: {},
		};
	}

	// Add variation to model
	const updatedModel = {
		...model,
		variations: [...model.variations, newVariation],
	};

	const updateResult = await updateSlice(repo, updatedModel as SharedSlice);
	if (!updateResult.ok) {
		console.error(`Failed to update slice: ${updateResult.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(`Added variation "${variationId}" to slice "${sliceId}"`);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}
