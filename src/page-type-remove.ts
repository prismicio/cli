import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { readFile, rm } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { findUpward } from "./lib/file";

const HELP = `
Remove a page type from the project.

USAGE
  prismic page-type remove <type-id> [flags]

ARGUMENTS
  type-id      Page type identifier (required)

FLAGS
  -y           Confirm removal
  -h, --help   Show help for command

EXAMPLES
  prismic page-type remove homepage
  prismic page-type remove homepage -y
`.trim();

const CustomTypeSchema = v.object({
	id: v.string(),
	label: v.string(),
	repeatable: v.boolean(),
	status: v.boolean(),
	format: v.optional(v.string()),
	json: v.record(v.string(), v.record(v.string(), v.unknown())),
});

export async function pageTypeRemove(): Promise<void> {
	const {
		values: { help, y },
		positionals: [typeId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "remove"
		options: {
			y: { type: "boolean", short: "y" },
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

	const projectRoot = await findUpward("package.json");
	if (!projectRoot) {
		console.error("Could not find project root (no package.json found)");
		process.exitCode = 1;
		return;
	}

	const typeDirectory = new URL(`customtypes/${typeId}/`, projectRoot);
	const modelPath = new URL("index.json", typeDirectory);

	// Verify the page type exists and is actually a page type
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
			console.error(`Page type not found: ${typeId}`);
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

	// Require -y flag to confirm deletion
	if (!y) {
		console.error(`Refusing to remove page type "${typeId}" (this will delete the entire directory).`);
		console.error("Re-run with -y to confirm.");
		process.exitCode = 1;
		return;
	}

	// Delete the page type directory
	try {
		await rm(typeDirectory, { recursive: true });
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
}
