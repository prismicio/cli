import type { CustomType, Link } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemotePageType, updateCustomType } from "./lib/custom-types-api";
import { humanReadable } from "./lib/string";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Add a link field to an existing page type.

USAGE
  prismic page-type add-field link <type-id> <field-id> [flags]

ARGUMENTS
  type-id                  Page type identifier (required)
  field-id                 Field identifier (required)

FLAGS
  -r, --repo string        Repository domain
  -t, --tab string         Target tab (default: first existing tab, or "Main")
  -l, --label string       Display label for the field (inferred from field-id if omitted)
  -p, --placeholder string Placeholder text
      --variation string   Slice variations (can be used multiple times)
      --allow-text         Allow text with link
      --allow-target-blank Allow opening link in new tab
      --repeatable         Allow multiple links
      --types string  Generate types to file (default: "prismicio-types.d.ts")
      --no-types      Skip type generation
  -h, --help               Show help for command

EXAMPLES
  prismic page-type add-field link homepage button
  prismic page-type add-field link homepage cta --allow-text
  prismic page-type add-field link homepage cta --variation Primary --variation Secondary
  prismic page-type add-field link homepage links --repeatable
`.trim();

export async function pageTypeAddFieldLink(): Promise<void> {
	const {
		values: {
			help,
			repo: repoFlag,
			tab,
			label,
			placeholder,
			variation,
			"allow-text": allowText,
			"allow-target-blank": allowTargetBlank,
			repeatable,
			types,
			"no-types": noTypes,
		},
		positionals: [typeId, fieldId],
	} = parseArgs({
		args: process.argv.slice(5), // skip: node, script, "page-type", "add-field", "link"
		options: {
			repo: { type: "string", short: "r" },
			tab: { type: "string", short: "t" },
			label: { type: "string", short: "l" },
			placeholder: { type: "string", short: "p" },
			variation: { type: "string", multiple: true },
			"allow-text": { type: "boolean" },
			"allow-target-blank": { type: "boolean" },
			repeatable: { type: "boolean" },
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
		console.error("Usage: prismic page-type add-field link <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic page-type add-field link <type-id> <field-id>");
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

	const fetchResult = await fetchRemotePageType(repo, typeId);
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
	const fieldDefinition: Link = {
		type: "Link",
		config: {
			label: label ?? humanReadable(fieldId),
			...(placeholder && { placeholder }),
			...(variation && variation.length > 0 && { variants: variation }),
			...(allowText && { allowText: true }),
			...(allowTargetBlank && { allowTargetBlank: true }),
			...(repeatable && { repeat: true }),
		},
	};

	// Add field to model
	model.json[targetTab][fieldId] = fieldDefinition;

	const updateResult = await updateCustomType(repo, model);
	if (!updateResult.ok) {
		console.error(`Failed to update page type: ${updateResult.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(`Added field "${fieldId}" (Link) to "${targetTab}" tab in ${typeId}`);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}
