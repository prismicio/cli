import type { CustomType, Group } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { type Framework, detectFrameworkInfo } from "./lib/framework";
import { requireFramework } from "./lib/framework-adapter";
import { humanReadable } from "./lib/string";

const HELP = `
Add a group field to an existing page type.

USAGE
  prismic page-type add-field group <type-id> <field-id> [flags]

ARGUMENTS
  type-id                Page type identifier (required)
  field-id               Field identifier (required)

FLAGS
  -t, --tab string       Target tab (default: first existing tab, or "Main")
  -l, --label string     Display label for the field (inferred from field-id if omitted)
      --non-repeatable   Make this a non-repeating group (default: repeatable)
      --types string     Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help             Show help for command

EXAMPLES
  prismic page-type add-field group homepage buttons
  prismic page-type add-field group article authors --non-repeatable
  prismic page-type add-field group product variants --tab "Content"
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

export async function pageTypeAddFieldGroup(): Promise<void> {
	const {
		values: { help, tab, label, "non-repeatable": nonRepeatable, types },
		positionals: [typeId, fieldId],
	} = parseArgs({
		args: process.argv.slice(5), // skip: node, script, "page-type", "add-field", "group"
		options: {
			tab: { type: "string", short: "t" },
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

	if (!typeId) {
		console.error("Missing required argument: type-id\n");
		console.error("Usage: prismic page-type add-field group <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic page-type add-field group <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	// Groups cannot be nested
	if (fieldId.includes(".")) {
		console.error("Groups cannot be nested inside other groups");
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
	const fieldDefinition: Group = {
		type: "Group",
		config: {
			label: label ?? humanReadable(fieldId),
			repeat: !nonRepeatable,
			fields: {},
		},
	};

	// Add field to model
	model.json[targetTab][fieldId] = fieldDefinition;

	// Write updated model
	await framework.updateCustomType(model);

	console.info(`Added field "${fieldId}" (Group) to "${targetTab}" tab in ${typeId}`);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}

	console.info();
	console.info(`Next: Add fields to the group with \`prismic page-type add-field <type> ${typeId} ${fieldId}.<field-id>\``);

	const frameworkInfo = await detectFrameworkInfo();
	if (frameworkInfo?.framework) {
		const docsPath = getDocsPath(frameworkInfo.framework);
		console.info(
			`      Run \`prismic docs fetch ${docsPath}#write-page-components\` to learn how to implement a page file`,
		);
	}
}
