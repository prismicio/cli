import type { CustomTypeModel } from "@prismicio/client";

import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { requireFramework } from "./lib/framework-adapter";

const HELP = `
Remove a page type from the project.

USAGE
  prismic page-type remove <type-id> [flags]

ARGUMENTS
  type-id      Page type identifier (required)

FLAGS
  -y           Confirm removal
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help   Show help for command

EXAMPLES
  prismic page-type remove homepage
  prismic page-type remove homepage -y
`.trim();

export async function pageTypeRemove(): Promise<void> {
	const {
		values: { help, y, types },
		positionals: [typeId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "remove"
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
		console.error("Usage: prismic page-type remove <type-id>");
		process.exitCode = 1;
		return;
	}

	const framework = await requireFramework();
	if (!framework) return;

	let model: CustomTypeModel;
	try {
		model = await framework.readCustomType(typeId);
	} catch {
		console.error(`Page type not found: ${typeId}\n\nCreate it first with: prismic page-type create ${typeId}`);
		process.exitCode = 1;
		return;
	}

	// Check if this is actually a page type
	if (model.format !== "page") {
		console.error(`"${typeId}" is not a page type (format: ${model.format ?? "custom"})`);
		process.exitCode = 1;
		return;
	}

	// Require -y flag to confirm deletion
	if (!y) {
		console.error(
			`Refusing to remove page type "${typeId}" (this will delete the entire directory).`,
		);
		console.error("Re-run with -y to confirm.");
		process.exitCode = 1;
		return;
	}

	// Delete the page type directory
	try {
		await framework.deleteCustomType(typeId);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to remove page type: ${error.message}`);
		} else {
			console.error("Failed to remove page type");
		}
		process.exitCode = 1;
		return;
	}

	console.info(`Removed page type "${typeId}"`);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}
}
