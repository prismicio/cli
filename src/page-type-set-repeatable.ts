import type { CustomTypeModel } from "@prismicio/client";

import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { requireFramework } from "./lib/framework-adapter";

const HELP = `
Set whether a page type is repeatable.

USAGE
  prismic page-type set-repeatable <type-id> <true|false> [flags]

ARGUMENTS
  type-id       Page type identifier (required)
  true|false    Repeatable value (required)

FLAGS
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help   Show help for command

EXAMPLES
  prismic page-type set-repeatable homepage true
  prismic page-type set-repeatable settings false
`.trim();

export async function pageTypeSetRepeatable(): Promise<void> {
	const {
		values: { help, types },
		positionals: [typeId, repeatableValue],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "set-repeatable"
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
		console.error("Usage: prismic page-type set-repeatable <type-id> <true|false>");
		process.exitCode = 1;
		return;
	}

	if (!repeatableValue) {
		console.error("Missing required argument: true|false\n");
		console.error("Usage: prismic page-type set-repeatable <type-id> <true|false>");
		process.exitCode = 1;
		return;
	}

	if (repeatableValue !== "true" && repeatableValue !== "false") {
		console.error(`Invalid value: "${repeatableValue}". Must be "true" or "false".`);
		process.exitCode = 1;
		return;
	}

	const repeatable = repeatableValue === "true";

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

	// Update the model
	model.repeatable = repeatable;

	// Write updated model
	try {
		await framework.updateCustomType(model as unknown as CustomTypeModel);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to update page type: ${error.message}`);
		} else {
			console.error("Failed to update page type");
		}
		process.exitCode = 1;
		return;
	}

	const typeLabel = repeatable ? "repeatable" : "singleton";
	console.info(`Set page type "${typeId}" to ${typeLabel}`);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}
}
