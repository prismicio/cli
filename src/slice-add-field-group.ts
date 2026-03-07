import type { Group, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { getDocsPath, getWriteComponentsAnchor, requireFramework } from "./framework";
import { humanReadable } from "./lib/string";

const HELP = `
Add a group field to an existing slice.

USAGE
  prismic slice add-field group <slice-id> <field-id> [flags]

ARGUMENTS
  slice-id               Slice identifier (required)
  field-id               Field identifier (required)

FLAGS
  -v, --variation string Target variation (default: first variation)
  -l, --label string     Display label for the field (inferred from field-id if omitted)
      --non-repeatable   Make this a non-repeating group (default: repeatable)
      --types string     Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help             Show help for command

EXAMPLES
  prismic slice add-field group my_slice buttons
  prismic slice add-field group hero ctas --non-repeatable
  prismic slice add-field group product variants --variation "withImage"
`.trim();



export async function sliceAddFieldGroup(): Promise<void> {
	const {
		values: { help, variation, label, "non-repeatable": nonRepeatable, types },
		positionals: [sliceId, fieldId],
	} = parseArgs({
		args: process.argv.slice(5), // skip: node, script, "slice", "add-field", "group"
		options: {
			variation: { type: "string", short: "v" },
			label: { type: "string", short: "l" },
			"non-repeatable": { type: "boolean" },
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
		console.error("Usage: prismic slice add-field group <slice-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic slice add-field group <slice-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	// Groups cannot be nested
	if (fieldId.includes(".")) {
		console.error("Groups cannot be nested inside other groups");
		process.exitCode = 1;
		return;
	}

	// Find the slice model
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
	const fieldDefinition: Group = {
		type: "Group",
		config: {
			label: label ?? humanReadable(fieldId),
			repeat: !nonRepeatable,
			fields: {},
		},
	};

	// Add field to variation
	targetVariation.primary[fieldId] = fieldDefinition;

	// Write updated model
	try {
		await framework.updateSlice(model);
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
		`Added field "${fieldId}" (Group) to "${targetVariation.id}" variation in ${sliceId}`,
	);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}

	console.info();
	console.info(`Next: Add fields to the group with \`prismic slice add-field <type> ${sliceId} ${fieldId}.<field-id>\``);

	if (framework) {
		const docsPath = getDocsPath(framework.id);
		const anchor = getWriteComponentsAnchor(framework.id);
		console.info(
			`      Run \`prismic docs fetch ${docsPath}${anchor}\` to learn how to implement the slice's component`,
		);
	}
}
