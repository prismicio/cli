import type { Color, CustomType } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { findGroupInTab, isGroupField, parseFieldPath, validateNestedFieldPath } from "./lib/field-path";
import { type Framework, detectFrameworkInfo } from "./lib/framework";
import { requireFramework } from "./lib/framework-adapter";
import { humanReadable } from "./lib/string";

const HELP = `
Add a color picker field to an existing page type.

USAGE
  prismic page-type add-field color <type-id> <field-id> [flags]

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
  prismic page-type add-field color homepage bg_color
  prismic page-type add-field color homepage accent --tab "Design"
  prismic page-type add-field color homepage text_color --label "Text Color"
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

export async function pageTypeAddFieldColor(): Promise<void> {
	const {
		values: { help, tab, label, placeholder, types },
		positionals: [typeId, fieldId],
	} = parseArgs({
		args: process.argv.slice(5), // skip: node, script, "page-type", "add-field", "color"
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
		console.error("Usage: prismic page-type add-field color <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic page-type add-field color <type-id> <field-id>");
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

	// Build field definition
	const fieldDefinition: Color = {
		type: "Color",
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
	await framework.updateCustomType(model);

	if (fieldPath.type === "nested") {
		console.info(`Added field "${fieldPath.nestedFieldId}" (Color) to group "${fieldPath.groupId}" in ${typeId}`);
	} else {
		console.info(`Added field "${fieldId}" (Color) to "${targetTab}" tab in ${typeId}`);
	}

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}

	console.info();
	console.info("Next: Add more fields with `prismic page-type add-field`");

	const frameworkInfo = await detectFrameworkInfo();
	if (frameworkInfo?.framework) {
		const docsPath = getDocsPath(frameworkInfo.framework);
		console.info(
			`      Run \`prismic docs fetch ${docsPath}#write-page-components\` to learn how to implement a page file`,
		);
	}
}
