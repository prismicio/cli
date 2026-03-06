import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { requireFramework } from "./lib/framework-adapter";

const HELP = `
Change a custom type's display name (label).

USAGE
  prismic custom-type set-name <type-id> <new-name> [flags]

ARGUMENTS
  type-id      Custom type identifier (required)
  new-name     New display name (required)

FLAGS
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help   Show help for command

EXAMPLES
  prismic custom-type set-name settings "Site Settings"
  prismic custom-type set-name menu "Navigation Menu"
`.trim();

export async function customTypeSetName(): Promise<void> {
	const {
		values: { help, types },
		positionals: [typeId, newName],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "custom-type", "set-name"
		options: {
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
		console.error("Usage: prismic custom-type set-name <type-id> <new-name>");
		process.exitCode = 1;
		return;
	}

	if (!newName) {
		console.error("Missing required argument: new-name\n");
		console.error("Usage: prismic custom-type set-name <type-id> <new-name>");
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

	// Update the model
	model.label = newName;

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

	console.info(`Renamed custom type "${typeId}" to "${newName}"`);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}
}
