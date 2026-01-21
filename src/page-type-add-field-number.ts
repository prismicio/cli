import type { CustomType, Number as NumberField } from "@prismicio/types-internal/lib/customtypes";

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { findUpward } from "./lib/file";
import { stringify } from "./lib/json";

const HELP = `
Add a number field to an existing page type.

USAGE
  prismic page-type add-field number <type-id> <field-id> [flags]

ARGUMENTS
  type-id                Page type identifier (required)
  field-id               Field identifier (required)

FLAGS
  -t, --tab string       Target tab (default: first existing tab, or "Main")
  -l, --label string     Display label for the field
  -p, --placeholder string Placeholder text
      --min number       Minimum value
      --max number       Maximum value
      --step number      Step increment
  -h, --help             Show help for command

EXAMPLES
  prismic page-type add-field number homepage price
  prismic page-type add-field number product quantity --min 0 --max 100
  prismic page-type add-field number settings rating --min 1 --max 5 --step 1
`.trim();

const CustomTypeSchema = v.object({
	id: v.string(),
	label: v.string(),
	repeatable: v.boolean(),
	status: v.boolean(),
	format: v.string(),
	json: v.record(v.string(), v.record(v.string(), v.unknown())),
});

export async function pageTypeAddFieldNumber(): Promise<void> {
	const {
		values: { help, tab, label, placeholder, min, max, step },
		positionals: [typeId, fieldId],
	} = parseArgs({
		args: process.argv.slice(5), // skip: node, script, "page-type", "add-field", "number"
		options: {
			tab: { type: "string", short: "t" },
			label: { type: "string", short: "l" },
			placeholder: { type: "string", short: "p" },
			min: { type: "string" },
			max: { type: "string" },
			step: { type: "string" },
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
		console.error("Usage: prismic page-type add-field number <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic page-type add-field number <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	// Parse numeric values
	const minValue = min !== undefined ? Number(min) : undefined;
	const maxValue = max !== undefined ? Number(max) : undefined;
	const stepValue = step !== undefined ? Number(step) : undefined;

	if (min !== undefined && Number.isNaN(minValue)) {
		console.error("Invalid --min value: must be a number");
		process.exitCode = 1;
		return;
	}

	if (max !== undefined && Number.isNaN(maxValue)) {
		console.error("Invalid --max value: must be a number");
		process.exitCode = 1;
		return;
	}

	if (step !== undefined && Number.isNaN(stepValue)) {
		console.error("Invalid --step value: must be a number");
		process.exitCode = 1;
		return;
	}

	// Find the page type file
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
			console.error(`Invalid page type model: ${modelPath.href}`);
			process.exitCode = 1;
			return;
		}
		model = result.output as CustomType;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			console.error(`Page type not found: ${typeId}\n`);
			console.error(`Create it first with: prismic page-type create ${typeId}`);
			process.exitCode = 1;
			return;
		}
		if (error instanceof Error) {
			console.error(`Failed to read page type: ${error.message}`);
		} else {
			console.error("Failed to read page type");
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
	const fieldDefinition: NumberField = {
		type: "Number",
		config: {
			...(label && { label }),
			...(placeholder && { placeholder }),
			...(minValue !== undefined && { min: minValue }),
			...(maxValue !== undefined && { max: maxValue }),
			...(stepValue !== undefined && { step: stepValue }),
		},
	};

	// Add field to model
	model.json[targetTab][fieldId] = fieldDefinition;

	// Write updated model
	try {
		await writeFile(modelPath, stringify(model));
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to update page type: ${error.message}`);
		} else {
			console.error("Failed to update page type");
		}
		process.exitCode = 1;
		return;
	}

	console.info(
		`Added field "${fieldId}" (Number) to "${targetTab}" tab in ${typeId}`,
	);
}
