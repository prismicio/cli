import type { BooleanField, CustomType } from "@prismicio/types-internal/lib/customtypes";

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { findUpward } from "./lib/file";
import { stringify } from "./lib/json";
import { humanReadable } from "./lib/string";

const HELP = `
Add a boolean (toggle) field to an existing custom type.

USAGE
  prismic custom-type add-field boolean <type-id> <field-id> [flags]

ARGUMENTS
  type-id                Custom type identifier (required)
  field-id               Field identifier (required)

FLAGS
  -t, --tab string       Target tab (default: first existing tab, or "Main")
  -l, --label string     Display label for the field (inferred from field-id if omitted)
      --default          Set default value to true
      --true-label string Label shown when toggle is on
      --false-label string Label shown when toggle is off
  -h, --help             Show help for command

EXAMPLES
  prismic custom-type add-field boolean homepage featured
  prismic custom-type add-field boolean article published --default
  prismic custom-type add-field boolean product available --true-label "In Stock" --false-label "Out of Stock"
`.trim();

const CustomTypeSchema = v.object({
	id: v.string(),
	label: v.string(),
	repeatable: v.boolean(),
	status: v.boolean(),
	format: v.string(),
	json: v.record(v.string(), v.record(v.string(), v.unknown())),
});

export async function customTypeAddFieldBoolean(): Promise<void> {
	const {
		values: {
			help,
			tab,
			label,
			default: defaultValue,
			"true-label": trueLabel,
			"false-label": falseLabel,
		},
		positionals: [typeId, fieldId],
	} = parseArgs({
		args: process.argv.slice(5), // skip: node, script, "custom-type", "add-field", "boolean"
		options: {
			tab: { type: "string", short: "t" },
			label: { type: "string", short: "l" },
			default: { type: "boolean" },
			"true-label": { type: "string" },
			"false-label": { type: "string" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!typeId) {
		console.error("Missing required argument: type-id\n");
		console.error("Usage: prismic custom-type add-field boolean <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic custom-type add-field boolean <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	// Find the custom type file
	const projectRoot = await findUpward("package.json");
	if (!projectRoot) {
		console.error("Could not find project root (no package.json found)");
		process.exitCode = 1;
		return;
	}

	const modelPath = new URL(`customtypes/${typeId}/index.json`, projectRoot);

	// Read and parse the model
	let model: CustomType;
	try {
		const contents = await readFile(modelPath, "utf8");
		const result = v.safeParse(CustomTypeSchema, JSON.parse(contents));
		if (!result.success) {
			console.error(`Invalid custom type model: ${modelPath.href}`);
			process.exitCode = 1;
			return;
		}
		model = result.output as CustomType;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			console.error(`Custom type not found: ${typeId}\n`);
			console.error(`Create it first with: prismic custom-type create ${typeId}`);
			process.exitCode = 1;
			return;
		}
		if (error instanceof Error) {
			console.error(`Failed to read custom type: ${error.message}`);
		} else {
			console.error("Failed to read custom type");
		}
		process.exitCode = 1;
		return;
	}

	// Determine target tab
	const existingTabs = Object.keys(model.json);
	const targetTab = tab ?? existingTabs[0] ?? "Main";

	// Initialize tab if it doesn't exist
	if (!model.json[targetTab]) {
		model.json[targetTab] = {};
	}

	// Check if field already exists in any tab
	for (const [tabName, tabFields] of Object.entries(model.json)) {
		if (tabFields[fieldId]) {
			console.error(`Field "${fieldId}" already exists in tab "${tabName}"`);
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

	// Add field to model
	model.json[targetTab][fieldId] = fieldDefinition;

	// Write updated model
	try {
		await writeFile(modelPath, stringify(model));
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to update custom type: ${error.message}`);
		} else {
			console.error("Failed to update custom type");
		}
		process.exitCode = 1;
		return;
	}

	console.info(
		`Added field "${fieldId}" (Boolean) to "${targetTab}" tab in ${typeId}`,
	);
}
