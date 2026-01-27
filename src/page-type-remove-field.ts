import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { buildTypes } from "./codegen-types";
import { findUpward } from "./lib/file";
import { stringify } from "./lib/json";

const HELP = `
Remove a field from a page type.

USAGE
  prismic page-type remove-field <type-id> <field-id> [flags]

ARGUMENTS
  type-id      Page type identifier (required)
  field-id     Field identifier (required)

FLAGS
  --tab string  Specific tab (searches all tabs if not specified)
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help    Show help for command

EXAMPLES
  prismic page-type remove-field homepage title
  prismic page-type remove-field homepage meta_title --tab "SEO & Metadata"
`.trim();

const CustomTypeSchema = v.object({
	id: v.string(),
	label: v.string(),
	repeatable: v.boolean(),
	status: v.boolean(),
	format: v.optional(v.string()),
	json: v.record(v.string(), v.record(v.string(), v.unknown())),
});

export async function pageTypeRemoveField(): Promise<void> {
	const {
		values: { help, tab, types },
		positionals: [typeId, fieldId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "remove-field"
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
		console.error("Usage: prismic page-type remove-field <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic page-type remove-field <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

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

	// Check if this is actually a page type
	if (model.format !== "page") {
		console.error(`"${typeId}" is not a page type (format: ${model.format ?? "custom"})`);
		process.exitCode = 1;
		return;
	}

	// Find and remove the field
	let foundTab: string | undefined;

	if (tab) {
		// Look in specific tab
		if (!model.json[tab]) {
			console.error(`Tab "${tab}" not found in page type "${typeId}"`);
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
			console.error(`Field "${fieldId}" not found in any tab of page type "${typeId}"`);
			process.exitCode = 1;
			return;
		}
	}

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

	console.info(`Removed field "${fieldId}" from tab "${foundTab}" in page type "${typeId}"`);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}
}
