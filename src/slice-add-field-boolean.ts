import type { BooleanField, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { type Framework, detectFrameworkInfo } from "./lib/framework";
import { stringify } from "./lib/json";
import { findSliceModel } from "./lib/slice";
import { humanReadable } from "./lib/string";

const HELP = `
Add a boolean (toggle) field to an existing slice.

USAGE
  prismic slice add-field boolean <slice-id> <field-id> [flags]

ARGUMENTS
  slice-id               Slice identifier (required)
  field-id               Field identifier (required)

FLAGS
  -v, --variation string Target variation (default: first variation)
  -l, --label string     Display label for the field (inferred from field-id if omitted)
      --default          Set default value to true
      --true-label string Label shown when toggle is on
      --false-label string Label shown when toggle is off
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help             Show help for command

EXAMPLES
  prismic slice add-field boolean my_slice featured
  prismic slice add-field boolean hero show_overlay --default
  prismic slice add-field boolean product available --true-label "In Stock" --false-label "Out of Stock"
`.trim();

function getDocsPath(framework: Framework): string {
	switch (framework) {
		case "next":
			return "nextjs/with-cli";
		case "nuxt":
			return "nuxt/with-cli";
		case "sveltekit":
			return "sveltekit/with-cli";
	}
}

function getWriteComponentsAnchor(framework: Framework): string {
	switch (framework) {
		case "nuxt":
			return "#write-vue-components";
		case "sveltekit":
			return "#write-svelte-components";
		default:
			return "#write-react-components";
	}
}

export async function sliceAddFieldBoolean(): Promise<void> {
	const {
		values: {
			help,
			variation,
			label,
			default: defaultValue,
			"true-label": trueLabel,
			"false-label": falseLabel,
			types,
		},
		positionals: [sliceId, fieldId],
	} = parseArgs({
		args: process.argv.slice(5), // skip: node, script, "slice", "add-field", "boolean"
		options: {
			variation: { type: "string", short: "v" },
			label: { type: "string", short: "l" },
			default: { type: "boolean" },
			"true-label": { type: "string" },
			"false-label": { type: "string" },
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
		console.error("Usage: prismic slice add-field boolean <slice-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic slice add-field boolean <slice-id> <field-id>");
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
	const fieldDefinition: BooleanField = {
		type: "Boolean",
		config: {
			label: label ?? humanReadable(fieldId),
			...(defaultValue && { default_value: true }),
			...(trueLabel && { placeholder_true: trueLabel }),
			...(falseLabel && { placeholder_false: falseLabel }),
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
		`Added field "${fieldId}" (Boolean) to "${targetVariation.id}" variation in ${sliceId}`,
	);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}

	console.info();
	console.info("Next: Add more fields with `prismic slice add-field`");

	const frameworkInfo = await detectFrameworkInfo();
	if (frameworkInfo?.framework) {
		const docsPath = getDocsPath(frameworkInfo.framework);
		const anchor = getWriteComponentsAnchor(frameworkInfo.framework);
		console.info(
			`      Run \`prismic docs ${docsPath}${anchor}\` to learn how to implement the slice's component`,
		);
	}
}
