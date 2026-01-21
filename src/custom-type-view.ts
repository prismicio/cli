import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { findUpward } from "./lib/file";

const HELP = `
View details of a specific custom type.

USAGE
  prismic custom-type view <type-id> [flags]

ARGUMENTS
  type-id      Custom type identifier (required)

FLAGS
  --json       Output as JSON
  -h, --help   Show help for command

EXAMPLES
  prismic custom-type view settings
  prismic custom-type view settings --json
`.trim();

const CustomTypeSchema = v.object({
	id: v.string(),
	label: v.string(),
	repeatable: v.boolean(),
	status: v.boolean(),
	format: v.optional(v.string()),
	json: v.record(v.string(), v.record(v.string(), v.unknown())),
});

export async function customTypeView(): Promise<void> {
	const {
		values: { help, json },
		positionals: [typeId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "custom-type", "view"
		options: {
			json: { type: "boolean" },
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
		console.error("Usage: prismic custom-type view <type-id>");
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
			console.error(`Custom type not found: ${typeId}\n`);
			console.error(`Create it first with: prismic custom-type create ${typeId}`);
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

	if (json) {
		console.info(JSON.stringify(model, null, 2));
		return;
	}

	console.info(`ID:         ${model.id}`);
	console.info(`Label:      ${model.label}`);
	console.info(`Repeatable: ${model.repeatable}`);

	const tabs = Object.entries(model.json);
	console.info(`\nTabs (${tabs.length}):`);
	for (const [tabName, tabFields] of tabs) {
		const fieldCount = Object.keys(tabFields).length;
		console.info(`  - ${tabName}: ${fieldCount} fields`);
	}
}
