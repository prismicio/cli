import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { requireFramework } from "./framework";

const HELP = `
Remove a custom type from the project.

USAGE
  prismic custom-type remove <type-id> [flags]

ARGUMENTS
  type-id      Custom type identifier (required)

FLAGS
  -y           Confirm removal
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help   Show help for command

EXAMPLES
  prismic custom-type remove settings
  prismic custom-type remove settings -y
`.trim();

export async function customTypeRemove(): Promise<void> {
	const {
		values: { help, y, types },
		positionals: [typeId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "custom-type", "remove"
		options: {
			y: { type: "boolean", short: "y" },
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
		console.error("Usage: prismic custom-type remove <type-id>");
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

	// Require -y flag to confirm deletion
	if (!y) {
		console.error(
			`Refusing to remove custom type "${typeId}" (this will delete the entire directory).`,
		);
		console.error("Re-run with -y to confirm.");
		process.exitCode = 1;
		return;
	}

	// Delete the custom type directory
	try {
		await framework.deleteCustomType(typeId);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to remove custom type: ${error.message}`);
		} else {
			console.error("Failed to remove custom type");
		}
		process.exitCode = 1;
		return;
	}

	console.info(`Removed custom type "${typeId}"`);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}
}
