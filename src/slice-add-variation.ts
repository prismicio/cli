import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { pascalCase } from "change-case";

import { buildTypes } from "./codegen-types";
import { requireFramework } from "./framework";

const HELP = `
Add a new variation to a slice.

USAGE
  prismic slice add-variation <slice-id> <variation-id> [flags]

ARGUMENTS
  slice-id       Slice identifier (required)
  variation-id   New variation identifier (required)

FLAGS
  --name string       Display name for the variation
  --copy-from string  Copy fields from an existing variation
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help          Show help for command

EXAMPLES
  prismic slice add-variation MySlice withImage
  prismic slice add-variation MySlice withImage --name "With Image"
  prismic slice add-variation MySlice withImage --copy-from default
`.trim();

export async function sliceAddVariation(): Promise<void> {
	const {
		values: { help, name, "copy-from": copyFrom, types },
		positionals: [sliceId, variationId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "add-variation"
		options: {
			name: { type: "string" },
			"copy-from": { type: "string" },
			types: { type: "string" },
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

	const framework = await requireFramework();
	if (!framework) return;

	let model: SharedSlice;
	try {
		model = await framework.readSlice(sliceId);
	} catch {
		console.error(`Slice not found: ${sliceId}\n\nCreate it first with: prismic slice create ${sliceId}`);
		process.exitCode = 1;
		return;
	}

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

	// Write updated model
	try {
		await framework.updateSlice(updatedModel);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to update slice: ${error.message}`);
		} else {
			console.error("Failed to update slice");
		}
		process.exitCode = 1;
		return;
	}

	console.info(`Added variation "${variationId}" to slice "${sliceId}"`);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}
}
