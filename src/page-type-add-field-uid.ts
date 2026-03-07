import type { CustomType, UID } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { parseFieldPath, validateNestedFieldPath } from "./lib/field-path";
import { getDocsPath, requireFramework } from "./framework";
import { humanReadable } from "./lib/string";

const HELP = `
Add a UID (unique identifier) field to an existing page type.

USAGE
  prismic page-type add-field uid <type-id> <field-id> [flags]

ARGUMENTS
  type-id                Page type identifier (required)
  field-id               Field identifier (required)

FLAGS
  -t, --tab string       Target tab (default: first existing tab, or "Main")
  -l, --label string     Display label for the field (inferred from field-id if omitted)
  -p, --placeholder string Placeholder text
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help             Show help for command

EXAMPLES
  prismic page-type add-field uid page uid
  prismic page-type add-field uid article slug --label "URL Slug"
  prismic page-type add-field uid product sku --placeholder "Enter unique SKU"
`.trim();


export async function pageTypeAddFieldUid(): Promise<void> {
	const {
		values: { help, tab, label, placeholder, types },
		positionals: [typeId, fieldId],
	} = parseArgs({
		args: process.argv.slice(5), // skip: node, script, "page-type", "add-field", "uid"
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
		console.error("Usage: prismic page-type add-field uid <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic page-type add-field uid <type-id> <field-id>");
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

	// UID fields cannot be nested in groups
	if (fieldPath.type === "nested") {
		console.error("UID fields cannot be nested inside groups");
		process.exitCode = 1;
		return;
	}

	const framework = await requireFramework();
	if (!framework) return;

	let model: CustomType;
	try {
		model = await framework.readCustomType(typeId);
	} catch {
		console.error(`Page type not found: ${typeId}\n\nCreate it first with: prismic page-type create ${typeId}`);
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
	const fieldDefinition: UID = {
		type: "UID",
		config: {
			label: label ?? humanReadable(fieldId),
			...(placeholder && { placeholder }),
		},
	};

	// Add field to model
	model.json[targetTab][fieldId] = fieldDefinition;

	// Write updated model
	await framework.updateCustomType(model);

	console.info(`Added field "${fieldId}" (UID) to "${targetTab}" tab in ${typeId}`);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}

	console.info();
	console.info("Next: Add more fields with `prismic page-type add-field`");

	if (framework) {
		const docsPath = getDocsPath(framework.id);
		console.info(
			`      Run \`prismic docs fetch ${docsPath}#write-page-components\` to learn how to implement a page file`,
		);
	}
}
