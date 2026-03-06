import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { requireFramework } from "./lib/framework-adapter";

const HELP = `
Remove a field from a custom type.

USAGE
  prismic custom-type remove-field <type-id> <field-id> [flags]

ARGUMENTS
  type-id      Custom type identifier (required)
  field-id     Field identifier (required)

FLAGS
  --tab string  Specific tab (searches all tabs if not specified)
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help    Show help for command

EXAMPLES
  prismic custom-type remove-field settings title
  prismic custom-type remove-field settings description --tab "Content"
`.trim();

export async function customTypeRemoveField(): Promise<void> {
	const {
		values: { help, tab, types },
		positionals: [typeId, fieldId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "custom-type", "remove-field"
		options: {
			tab: { type: "string" },
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
		console.error("Usage: prismic custom-type remove-field <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic custom-type remove-field <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	const framework = await requireFramework();
	if (!framework) return;

	let model: CustomType;
	try {
		model = await framework.readCustomType(typeId);
	} catch {
		console.error(`Custom type not found: ${typeId}\n\nCreate it first with: prismic custom-type create ${typeId}`);
		process.exitCode = 1;
		return;
	}

	// Check if this is actually a custom type (not a page type)
	if (model.format === "page") {
		console.error(`"${typeId}" is not a custom type (format: page)`);
		process.exitCode = 1;
		return;
	}

	// Find and remove the field
	let foundTab: string | undefined;

	if (tab) {
		// Look in specific tab
		if (!model.json[tab]) {
			console.error(`Tab "${tab}" not found in custom type "${typeId}"`);
			console.error(`Available tabs: ${Object.keys(model.json).join(", ")}`);
			process.exitCode = 1;
			return;
		}
		if (!(fieldId in model.json[tab])) {
			console.error(`Field "${fieldId}" not found in tab "${tab}"`);
			process.exitCode = 1;
			return;
		}
		delete model.json[tab][fieldId];
		foundTab = tab;
	} else {
		// Search all tabs
		for (const [tabName, tabFields] of Object.entries(model.json)) {
			if (fieldId in tabFields) {
				delete tabFields[fieldId];
				foundTab = tabName;
				break;
			}
		}
		if (!foundTab) {
			console.error(`Field "${fieldId}" not found in any tab of custom type "${typeId}"`);
			process.exitCode = 1;
			return;
		}
	}

	// Write updated model
	try {
		await framework.updateCustomType(model);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to update custom type: ${error.message}`);
		} else {
			console.error("Failed to update custom type");
		}
		process.exitCode = 1;
		return;
	}

	console.info(`Removed field "${fieldId}" from tab "${foundTab}" in custom type "${typeId}"`);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}
}
