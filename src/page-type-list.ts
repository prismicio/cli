import { readdir, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { findUpward } from "./lib/file";

const HELP = `
List all page types in a Prismic project.

USAGE
  prismic page-type list [flags]

FLAGS
  --json       Output as JSON
  -h, --help   Show help for command

EXAMPLES
  prismic page-type list
  prismic page-type list --json
`.trim();

const CustomTypeSchema = v.object({
	id: v.string(),
	label: v.string(),
	repeatable: v.boolean(),
	status: v.boolean(),
	format: v.optional(v.string()),
	json: v.record(v.string(), v.record(v.string(), v.unknown())),
});

export async function pageTypeList(): Promise<void> {
	const {
		values: { help, json },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "list"
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

	const projectRoot = await findUpward("package.json");
	if (!projectRoot) {
		console.error("Could not find project root (no package.json found)");
		process.exitCode = 1;
		return;
	}

	const customTypesDirectory = new URL("customtypes/", projectRoot);

	let entries: string[];
	try {
		entries = (await readdir(customTypesDirectory, {
			withFileTypes: false,
		})) as unknown as string[];
	} catch {
		if (json) {
			console.info(JSON.stringify([]));
		} else {
			console.info("No page types found.");
		}
		return;
	}

	const pageTypes: { id: string; label: string; repeatable: boolean }[] = [];

	for (const entry of entries) {
		const modelPath = new URL(`${entry}/index.json`, customTypesDirectory);
		try {
			const contents = await readFile(modelPath, "utf8");
			const parsed = JSON.parse(contents);
			const result = v.safeParse(CustomTypeSchema, parsed);
			if (result.success && result.output.format === "page") {
				pageTypes.push({
					id: result.output.id,
					label: result.output.label,
					repeatable: result.output.repeatable,
				});
			}
		} catch {
			// Skip directories without valid index.json
		}
	}

	if (pageTypes.length === 0) {
		if (json) {
			console.info(JSON.stringify([]));
		} else {
			console.info("No page types found.");
		}
		return;
	}

	if (json) {
		console.info(JSON.stringify(pageTypes, null, 2));
	} else {
		console.info("ID\tLABEL\tTYPE");
		for (const pageType of pageTypes) {
			const typeLabel = pageType.repeatable ? "repeatable" : "singleton";
			console.info(`${pageType.id}\t${pageType.label}\t${typeLabel}`);
		}
	}
}
