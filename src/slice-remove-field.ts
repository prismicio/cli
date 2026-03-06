import type { SharedSliceModel } from "@prismicio/client";

import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { requireFramework } from "./lib/framework-adapter";

const HELP = `
Remove a field from a slice variation.

USAGE
  prismic slice remove-field <slice-id> <field-id> [flags]

ARGUMENTS
  slice-id     Slice identifier (required)
  field-id     Field identifier (required)

FLAGS
  --variation string  Target variation (default: "default")
  --zone string       Field zone: "primary" or "items" (default: "primary")
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help          Show help for command

EXAMPLES
  prismic slice remove-field MySlice title
  prismic slice remove-field MySlice title --variation withImage
  prismic slice remove-field MySlice item_title --zone items
`.trim();

export async function sliceRemoveField(): Promise<void> {
	const {
		values: { help, variation, zone, types },
		positionals: [sliceId, fieldId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "remove-field"
		options: {
			variation: { type: "string", default: "default" },
			zone: { type: "string", default: "primary" },
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
		console.error("Usage: prismic slice remove-field <slice-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic slice remove-field <slice-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (zone !== "primary" && zone !== "items") {
		console.error(`Invalid zone: ${zone}. Must be "primary" or "items".`);
		process.exitCode = 1;
		return;
	}

	const framework = await requireFramework();
	if (!framework) return;

	let model;
	try {
		model = await framework.readSlice(sliceId);
	} catch {
		console.error(`Slice not found: ${sliceId}\n\nCreate it first with: prismic slice create ${sliceId}`);
		process.exitCode = 1;
		return;
	}

	// Find the variation
	const targetVariation = model.variations.find((v) => v.id === variation);
	if (!targetVariation) {
		console.error(`Variation not found: ${variation}`);
		console.error(`Available variations: ${model.variations.map((v) => v.id).join(", ")}`);
		process.exitCode = 1;
		return;
	}

	// Check if field exists
	const zoneFields = zone === "primary" ? targetVariation.primary : targetVariation.items;
	if (!zoneFields || !(fieldId in zoneFields)) {
		console.error(`Field "${fieldId}" not found in ${zone} zone of variation "${variation}"`);
		process.exitCode = 1;
		return;
	}

	// Remove the field
	delete zoneFields[fieldId];

	// Write updated model
	try {
		await framework.updateSlice(model as unknown as SharedSliceModel);
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
		`Removed field "${fieldId}" from ${zone} zone in variation "${variation}" of slice "${sliceId}"`,
	);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}
}
