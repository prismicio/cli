import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { stringify } from "./lib/json";
import { findSliceModel } from "./lib/slice";

const HELP = `
Remove a variation from a slice.

USAGE
  prismic slice remove-variation <slice-id> <variation-id> [flags]

ARGUMENTS
  slice-id       Slice identifier (required)
  variation-id   Variation to remove (required)

FLAGS
  -h, --help   Show help for command

EXAMPLES
  prismic slice remove-variation MySlice withImage
`.trim();

export async function sliceRemoveVariation(): Promise<void> {
	const {
		values: { help },
		positionals: [sliceId, variationId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "remove-variation"
		options: {
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
		console.error(
			"Usage: prismic slice remove-variation <slice-id> <variation-id>",
		);
		process.exitCode = 1;
		return;
	}

	if (!variationId) {
		console.error("Missing required argument: variation-id\n");
		console.error(
			"Usage: prismic slice remove-variation <slice-id> <variation-id>",
		);
		process.exitCode = 1;
		return;
	}

	const result = await findSliceModel(sliceId);
	if (!result.ok) {
		console.error(result.error);
		process.exitCode = 1;
		return;
	}

	const { model, modelPath } = result;

	// Check if variation exists
	const variationExists = model.variations.some((v) => v.id === variationId);
	if (!variationExists) {
		console.error(`Variation not found: ${variationId}`);
		console.error(
			`Available variations: ${model.variations.map((v) => v.id).join(", ")}`,
		);
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

	// Write updated model
	try {
		await writeFile(modelPath, stringify(updatedModel as SharedSlice));
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to update slice: ${error.message}`);
		} else {
			console.error("Failed to update slice");
		}
		process.exitCode = 1;
		return;
	}

	console.info(`Removed variation "${variationId}" from slice "${sliceId}"`);
}
