import type { Color, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { findGroupInVariation, isGroupField, parseFieldPath, validateNestedFieldPath } from "./lib/field-path";
import { getDocsPath, getWriteComponentsAnchor, requireFramework } from "./lib/framework-adapter";
import { humanReadable } from "./lib/string";

const HELP = `
Add a color picker field to an existing slice.

USAGE
  prismic slice add-field color <slice-id> <field-id> [flags]

ARGUMENTS
  slice-id               Slice identifier (required)
  field-id               Field identifier (required)

FLAGS
  -v, --variation string Target variation (default: first variation)
  -l, --label string     Display label for the field (inferred from field-id if omitted)
  -p, --placeholder string Placeholder text
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help             Show help for command

EXAMPLES
  prismic slice add-field color my_slice background_color
  prismic slice add-field color hero accent --label "Accent Color"
  prismic slice add-field color banner theme_color --variation "dark"
`.trim();



export async function sliceAddFieldColor(): Promise<void> {
	const {
		values: { help, variation, label, placeholder, types },
		positionals: [sliceId, fieldId],
	} = parseArgs({
		args: process.argv.slice(5), // skip: node, script, "slice", "add-field", "color"
		options: {
			variation: { type: "string", short: "v" },
			label: { type: "string", short: "l" },
			placeholder: { type: "string", short: "p" },
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
		console.error("Usage: prismic slice add-field color <slice-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic slice add-field color <slice-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	// Parse and validate field path
	const fieldPath = parseFieldPath(fieldId);
	const pathValidation = validateNestedFieldPath(fieldPath);
	if (!pathValidation.ok) {
		console.error(pathValidation.error);
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

	// Build field definition
	const fieldDefinition: Color = {
		type: "Color",
		config: {
			label: label ?? humanReadable(fieldPath.type === "nested" ? fieldPath.nestedFieldId : fieldId),
			...(placeholder && { placeholder }),
		},
	};

	// Add field to variation (with nested field support)
	if (fieldPath.type === "nested") {
		const groupResult = findGroupInVariation(targetVariation.primary, fieldPath.groupId, targetVariation.id);
		if (!groupResult.ok) {
			console.error(groupResult.error);
			process.exitCode = 1;
			return;
		}
		// Check if nested field already exists
		if (groupResult.group.config.fields[fieldPath.nestedFieldId]) {
			console.error(
				`Field "${fieldPath.nestedFieldId}" already exists in group "${fieldPath.groupId}"`,
			);
			process.exitCode = 1;
			return;
		}
		groupResult.group.config.fields[fieldPath.nestedFieldId] = fieldDefinition;
	} else {
		// Check if field already exists in any variation (at top level or in groups)
		for (const v of model.variations) {
			if (v.primary?.[fieldId]) {
				console.error(`Field "${fieldId}" already exists in variation "${v.id}"`);
				process.exitCode = 1;
				return;
			}
			// Also check inside groups
			for (const [groupFieldId, groupField] of Object.entries(v.primary ?? {})) {
				if (isGroupField(groupField) && groupField.config.fields[fieldId]) {
					console.error(
						`Field "${fieldId}" already exists in group "${groupFieldId}" in variation "${v.id}"`,
					);
					process.exitCode = 1;
					return;
				}
			}
		}
		targetVariation.primary[fieldId] = fieldDefinition;
	}

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

	if (fieldPath.type === "nested") {
		console.info(
			`Added field "${fieldPath.nestedFieldId}" (Color) to group "${fieldPath.groupId}" in ${sliceId}`,
		);
	} else {
		console.info(
			`Added field "${fieldId}" (Color) to "${targetVariation.id}" variation in ${sliceId}`,
		);
	}

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}

	console.info();
	console.info("Next: Add more fields with `prismic slice add-field`");

	if (framework) {
		const docsPath = getDocsPath(framework.id);
		const anchor = getWriteComponentsAnchor(framework.id);
		console.info(
			`      Run \`prismic docs fetch ${docsPath}${anchor}\` to learn how to implement the slice's component`,
		);
	}
}
