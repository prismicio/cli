import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { readFile, rm } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { buildTypes } from "./codegen-types";
import { findUpward } from "./lib/file";

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

const CustomTypeSchema = v.object({
	id: v.string(),
	label: v.string(),
	repeatable: v.boolean(),
	status: v.boolean(),
	format: v.optional(v.string()),
	json: v.record(v.string(), v.record(v.string(), v.unknown())),
});

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

	const projectRoot = await findUpward("package.json");
	if (!projectRoot) {
		console.error("Could not find project root (no package.json found)");
		process.exitCode = 1;
		return;
	}

	const typeDirectory = new URL(`customtypes/${typeId}/`, projectRoot);
	const modelPath = new URL("index.json", typeDirectory);

	// Verify the custom type exists and is actually a custom type
	let model: CustomType;
	try {
		const contents = await readFile(modelPath, "utf8");
		const result = v.safeParse(CustomTypeSchema, JSON.parse(contents));
		if (!result.success) {
			console.error(`Invalid custom type model: ${modelPath.href}`);
			process.exitCode = 1;
			return;
		}
		model = result.output as CustomType;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			console.error(`Custom type not found: ${typeId}`);
			process.exitCode = 1;
			return;
		}
		if (error instanceof Error) {
			console.error(`Failed to read custom type: ${error.message}`);
		} else {
			console.error("Failed to read custom type");
		}
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
		await rm(typeDirectory, { recursive: true });
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
