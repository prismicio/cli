import type { CustomType, Image } from "@prismicio/types-internal/lib/customtypes";

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { buildTypes } from "./codegen-types";
import { findUpward } from "./lib/file";
import { findGroupInTab, isGroupField, parseFieldPath, validateNestedFieldPath } from "./lib/field-path";
import { stringify } from "./lib/json";
import { humanReadable } from "./lib/string";

const HELP = `
Add an image field to an existing custom type.

USAGE
  prismic custom-type add-field image <type-id> <field-id> [flags]

ARGUMENTS
  type-id                Custom type identifier (required)
  field-id               Field identifier (required)

FLAGS
  -t, --tab string       Target tab (default: first existing tab, or "Main")
  -l, --label string     Display label for the field (inferred from field-id if omitted)
  -p, --placeholder string Placeholder text
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help             Show help for command

EXAMPLES
  prismic custom-type add-field image homepage hero
  prismic custom-type add-field image article thumbnail --tab "Media"
  prismic custom-type add-field image product photo --label "Product Photo"
`.trim();

const CustomTypeSchema = v.object({
	id: v.string(),
	label: v.string(),
	repeatable: v.boolean(),
	status: v.boolean(),
	format: v.string(),
	json: v.record(v.string(), v.record(v.string(), v.unknown())),
});

export async function customTypeAddFieldImage(): Promise<void> {
	const {
		values: { help, tab, label, placeholder, types },
		positionals: [typeId, fieldId],
	} = parseArgs({
		args: process.argv.slice(5), // skip: node, script, "custom-type", "add-field", "image"
		options: {
			tab: { type: "string", short: "t" },
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

	if (!typeId) {
		console.error("Missing required argument: type-id\n");
		console.error("Usage: prismic custom-type add-field image <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic custom-type add-field image <type-id> <field-id>");
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

	// Build field definition
	const fieldDefinition: Image = {
		type: "Image",
		config: {
			label: label ?? humanReadable(fieldPath.type === "nested" ? fieldPath.nestedFieldId : fieldId),
			...(placeholder && { placeholder }),
		},
	};

	// Add field to model
	if (fieldPath.type === "nested") {
		const groupResult = findGroupInTab(model.json[targetTab], fieldPath.groupId, targetTab);
		if (!groupResult.ok) {
			console.error(groupResult.error);
			process.exitCode = 1;
			return;
		}
		if (groupResult.group.config.fields[fieldPath.nestedFieldId]) {
			console.error(`Field "${fieldPath.nestedFieldId}" already exists in group "${fieldPath.groupId}"`);
			process.exitCode = 1;
			return;
		}
		groupResult.group.config.fields[fieldPath.nestedFieldId] = fieldDefinition;
	} else {
		for (const [tabName, tabFields] of Object.entries(model.json)) {
			if (tabFields[fieldId]) {
				console.error(`Field "${fieldId}" already exists in tab "${tabName}"`);
				process.exitCode = 1;
				return;
			}
			for (const [groupFieldId, groupField] of Object.entries(tabFields)) {
				if (isGroupField(groupField) && groupField.config.fields[fieldId]) {
					console.error(`Field "${fieldId}" already exists in group "${groupFieldId}" in tab "${tabName}"`);
					process.exitCode = 1;
					return;
				}
			}
		}
		model.json[targetTab][fieldId] = fieldDefinition;
	}

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

	if (fieldPath.type === "nested") {
		console.info(`Added field "${fieldPath.nestedFieldId}" (Image) to group "${fieldPath.groupId}" in ${typeId}`);
	} else {
		console.info(`Added field "${fieldId}" (Image) to "${targetTab}" tab in ${typeId}`);
	}

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}

	console.info();
	console.info("Next: Add more fields with `prismic custom-type add-field`");
	console.info("      Run `prismic status` when done to find next steps");
}
