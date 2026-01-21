import type { Image, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { stringify } from "./lib/json";
import { findSliceModel } from "./lib/slice";

const HELP = `
Add an image field to an existing slice.

USAGE
  prismic slice add-field image <slice-id> <field-id> [flags]

ARGUMENTS
  slice-id               Slice identifier (required)
  field-id               Field identifier (required)

FLAGS
  -v, --variation string Target variation (default: first variation)
  -l, --label string     Display label for the field
  -h, --help             Show help for command

EXAMPLES
  prismic slice add-field image my_slice background
  prismic slice add-field image hero banner --label "Hero Banner"
  prismic slice add-field image gallery thumbnail --variation "grid"
`.trim();

export async function sliceAddFieldImage(): Promise<void> {
	const {
		values: { help, variation, label },
		positionals: [sliceId, fieldId],
	} = parseArgs({
		args: process.argv.slice(5), // skip: node, script, "slice", "add-field", "image"
		options: {
			variation: { type: "string", short: "v" },
			label: { type: "string", short: "l" },
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
		console.error("Usage: prismic slice add-field image <slice-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic slice add-field image <slice-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	// Find the slice model
	const result = await findSliceModel(sliceId);
	if (!result.ok) {
		console.error(result.error);
		process.exitCode = 1;
		return;
	}

	const { model, modelPath } = result;

	// Check for variations
	if (model.variations.length === 0) {
		console.error(`Slice "${sliceId}" has no variations.\n`);
		console.error("Add a variation first before adding fields.");
		process.exitCode = 1;
		return;
	}

	// Find target variation
	const targetVariation = variation
		? model.variations.find((v) => v.id === variation)
		: model.variations[0];

	if (!targetVariation) {
		console.error(`Variation "${variation}" not found in slice "${sliceId}"\n`);
		console.error(`Available variations: ${model.variations.map((v) => v.id).join(", ")}`);
		process.exitCode = 1;
		return;
	}

	// Initialize primary if it doesn't exist
	if (!targetVariation.primary) {
		targetVariation.primary = {};
	}

	// Check if field already exists in any variation
	for (const v of model.variations) {
		if (v.primary?.[fieldId]) {
			console.error(`Field "${fieldId}" already exists in variation "${v.id}"`);
			process.exitCode = 1;
			return;
		}
	}

	// Build field definition
	const fieldDefinition: Image = {
		type: "Image",
		config: {
			...(label && { label }),
		},
	};

	// Add field to variation
	targetVariation.primary[fieldId] = fieldDefinition;

	// Write updated model
	try {
		await writeFile(modelPath, stringify(model as SharedSlice));
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to update slice: ${error.message}`);
		} else {
			console.error("Failed to update slice");
		}
		process.exitCode = 1;
		return;
	}

	console.info(
		`Added field "${fieldId}" (Image) to "${targetVariation.id}" variation in ${sliceId}`,
	);
}
