import type { CustomType, RichText } from "@prismicio/types-internal/lib/customtypes";

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { findUpward } from "./lib/file";
import { stringify } from "./lib/json";
import { humanReadable } from "./lib/string";

const HELP = `
Add a rich text field to an existing custom type.

USAGE
  prismic custom-type add-field rich-text <type-id> <field-id> [flags]

ARGUMENTS
  type-id                Custom type identifier (required)
  field-id               Field identifier (required)

FLAGS
  -t, --tab string       Target tab (default: first existing tab, or "Main")
  -l, --label string     Display label for the field (inferred from field-id if omitted)
  -p, --placeholder string Placeholder text
      --single string    Allowed block types for single-line (comma-separated)
      --multi string     Allowed block types for multi-line (comma-separated)
      --allow-target-blank Allow opening links in new tab
  -h, --help             Show help for command

BLOCK TYPES
  heading1, heading2, heading3, heading4, heading5, heading6,
  paragraph, strong, em, preformatted, hyperlink, image, embed,
  list-item, o-list-item, rtl

EXAMPLES
  prismic custom-type add-field rich-text homepage body
  prismic custom-type add-field rich-text article content --multi "paragraph,heading2,heading3,strong,em,hyperlink"
  prismic custom-type add-field rich-text page tagline --single "heading1"
  prismic custom-type add-field rich-text blog post --multi "paragraph,strong,em,hyperlink" --allow-target-blank
`.trim();

const CustomTypeSchema = v.object({
	id: v.string(),
	label: v.string(),
	repeatable: v.boolean(),
	status: v.boolean(),
	format: v.string(),
	json: v.record(v.string(), v.record(v.string(), v.unknown())),
});

export async function customTypeAddFieldRichText(): Promise<void> {
	const {
		values: {
			help,
			tab,
			label,
			placeholder,
			single,
			multi,
			"allow-target-blank": allowTargetBlank,
		},
		positionals: [typeId, fieldId],
	} = parseArgs({
		args: process.argv.slice(5), // skip: node, script, "custom-type", "add-field", "rich-text"
		options: {
			tab: { type: "string", short: "t" },
			label: { type: "string", short: "l" },
			placeholder: { type: "string", short: "p" },
			single: { type: "string" },
			multi: { type: "string" },
			"allow-target-blank": { type: "boolean" },
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
		console.error("Usage: prismic custom-type add-field rich-text <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic custom-type add-field rich-text <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	// Find the custom type file
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
	const fieldDefinition: RichText = {
		type: "StructuredText",
		config: {
			label: label ?? humanReadable(fieldId),
			...(placeholder && { placeholder }),
			...(single && { single }),
			...(multi && { multi }),
			...(allowTargetBlank && { allowTargetBlank: true }),
		},
	};

	// Add field to model
	model.json[targetTab][fieldId] = fieldDefinition;

	// Write updated model
	try {
		await writeFile(modelPath, stringify(model));
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to update custom type: ${error.message}`);
		} else {
			console.error("Failed to update custom type");
		}
		process.exitCode = 1;
		return;
	}

	console.info(
		`Added field "${fieldId}" (StructuredText) to "${targetTab}" tab in ${typeId}`,
	);
}
