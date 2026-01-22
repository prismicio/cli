import type { CustomType, RichText } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemoteCustomType, updateCustomType } from "./lib/custom-types-api";
import { humanReadable } from "./lib/string";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Add a rich text field to an existing custom type.

USAGE
  prismic custom-type add-field rich-text <type-id> <field-id> [flags]

ARGUMENTS
  type-id                Custom type identifier (required)
  field-id               Field identifier (required)

FLAGS
  -r, --repo string      Repository domain
  -t, --tab string       Target tab (default: first existing tab, or "Main")
  -l, --label string     Display label for the field (inferred from field-id if omitted)
  -p, --placeholder string Placeholder text
      --single string    Allowed block types for single-line (comma-separated)
      --multi string     Allowed block types for multi-line (comma-separated)
      --allow-target-blank Allow opening links in new tab
      --types string     Generate types to file (default: "prismicio-types.d.ts")
      --no-types         Skip type generation
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

export async function customTypeAddFieldRichText(): Promise<void> {
	const {
		values: {
			help,
			repo: repoFlag,
			tab,
			label,
			placeholder,
			single,
			multi,
			"allow-target-blank": allowTargetBlank,
			types,
			"no-types": noTypes,
		},
		positionals: [typeId, fieldId],
	} = parseArgs({
		args: process.argv.slice(5), // skip: node, script, "custom-type", "add-field", "rich-text"
		options: {
			repo: { type: "string", short: "r" },
			tab: { type: "string", short: "t" },
			label: { type: "string", short: "l" },
			placeholder: { type: "string", short: "p" },
			single: { type: "string" },
			multi: { type: "string" },
			"allow-target-blank": { type: "boolean" },
			types: { type: "string" },
			"no-types": { type: "boolean" },
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

	const repo = repoFlag ?? (await safeGetRepositoryFromConfig());
	if (!repo) {
		console.error("Missing prismic.config.json or --repo option");
		process.exitCode = 1;
		return;
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		console.error("Not logged in. Run `prismic login` first.");
		process.exitCode = 1;
		return;
	}

	const fetchResult = await fetchRemoteCustomType(repo, typeId);
	if (!fetchResult.ok) {
		console.error(fetchResult.error);
		process.exitCode = 1;
		return;
	}

	const model: CustomType = fetchResult.value;

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

	const updateResult = await updateCustomType(repo, model);
	if (!updateResult.ok) {
		console.error(`Failed to update custom type: ${updateResult.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(`Added field "${fieldId}" (StructuredText) to "${targetTab}" tab in ${typeId}`);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}
