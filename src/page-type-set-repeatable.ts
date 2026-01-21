import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { findUpward } from "./lib/file";
import { stringify } from "./lib/json";

const HELP = `
Set whether a page type is repeatable.

USAGE
  prismic page-type set-repeatable <type-id> <true|false> [flags]

ARGUMENTS
  type-id       Page type identifier (required)
  true|false    Repeatable value (required)

FLAGS
  -h, --help   Show help for command

EXAMPLES
  prismic page-type set-repeatable homepage true
  prismic page-type set-repeatable settings false
`.trim();

const CustomTypeSchema = v.object({
	id: v.string(),
	label: v.string(),
	repeatable: v.boolean(),
	status: v.boolean(),
	format: v.optional(v.string()),
	json: v.record(v.string(), v.record(v.string(), v.unknown())),
});

export async function pageTypeSetRepeatable(): Promise<void> {
	const {
		values: { help },
		positionals: [typeId, repeatableValue],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "set-repeatable"
		options: {
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

	// Update the model
	model.repeatable = repeatable;

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

	const typeLabel = repeatable ? "repeatable" : "singleton";
	console.info(`Set page type "${typeId}" to ${typeLabel}`);
}
