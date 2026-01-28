import type { CustomType, Date as DateField } from "@prismicio/types-internal/lib/customtypes";

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { buildTypes } from "./codegen-types";
import { findUpward } from "./lib/file";
import { type Framework, detectFrameworkInfo } from "./lib/framework";
import { stringify } from "./lib/json";
import { humanReadable } from "./lib/string";

const HELP = `
Add a date field to an existing page type.

USAGE
  prismic page-type add-field date <type-id> <field-id> [flags]

ARGUMENTS
  type-id                Page type identifier (required)
  field-id               Field identifier (required)

FLAGS
  -t, --tab string       Target tab (default: first existing tab, or "Main")
  -l, --label string     Display label for the field (inferred from field-id if omitted)
  -p, --placeholder string Placeholder text
      --default string   Default date value (YYYY-MM-DD format)
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help             Show help for command

EXAMPLES
  prismic page-type add-field date homepage publish_date
  prismic page-type add-field date event start_date --tab "Schedule"
  prismic page-type add-field date article date --label "Publication Date" --default "2024-01-01"
`.trim();

const CustomTypeSchema = v.object({
	id: v.string(),
	label: v.string(),
	repeatable: v.boolean(),
	status: v.boolean(),
	format: v.string(),
	json: v.record(v.string(), v.record(v.string(), v.unknown())),
});

function getDocsPath(framework: Framework): string {
	switch (framework) {
		case "next":
			return "nextjs/with-cli";
		case "nuxt":
			return "nuxt/with-cli";
		case "sveltekit":
			return "sveltekit/with-cli";
	}
}

export async function pageTypeAddFieldDate(): Promise<void> {
	const {
		values: { help, tab, label, placeholder, default: defaultValue, types },
		positionals: [typeId, fieldId],
	} = parseArgs({
		args: process.argv.slice(5), // skip: node, script, "page-type", "add-field", "date"
		options: {
			tab: { type: "string", short: "t" },
			label: { type: "string", short: "l" },
			placeholder: { type: "string", short: "p" },
			default: { type: "string" },
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
		console.error("Usage: prismic page-type add-field date <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic page-type add-field date <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	// Find the page type file
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

	// Determine target tab
	const existingTabs = Object.keys(model.json);
	const targetTab = tab ?? existingTabs[0] ?? "Main";

	// Initialize tab if it doesn't exist
	if (!model.json[targetTab]) {
		model.json[targetTab] = {};
	}

	// Check if field already exists in any tab
	for (const [tabName, tabFields] of Object.entries(model.json)) {
		if (tabFields[fieldId]) {
			console.error(`Field "${fieldId}" already exists in tab "${tabName}"`);
			process.exitCode = 1;
			return;
		}
	}

	// Build field definition
	const fieldDefinition: DateField = {
		type: "Date",
		config: {
			label: label ?? humanReadable(fieldId),
			...(placeholder && { placeholder }),
			...(defaultValue && { default: defaultValue }),
		},
	};

	// Add field to model
	model.json[targetTab][fieldId] = fieldDefinition;

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

	console.info(`Added field "${fieldId}" (Date) to "${targetTab}" tab in ${typeId}`);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}

	console.info();
	console.info("Next: Add more fields with `prismic page-type add-field`");

	const frameworkInfo = await detectFrameworkInfo();
	if (frameworkInfo?.framework) {
		const docsPath = getDocsPath(frameworkInfo.framework);
		console.info(
			`      Run \`prismic docs ${docsPath}#write-page-components\` to learn how to implement a page file`,
		);
	}
}
