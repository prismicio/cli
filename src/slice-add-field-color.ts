import type { Color } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchSlice, updateSlice } from "./lib/custom-types-api";
import { humanReadable } from "./lib/string";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Add a color picker field to an existing slice.

USAGE
  prismic slice add-field color <slice-id> <field-id> [flags]

ARGUMENTS
  slice-id               Slice identifier (required)
  field-id               Field identifier (required)

FLAGS
  -r, --repo string      Repository domain
  -v, --variation string Target variation (default: first variation)
  -l, --label string     Display label for the field (inferred from field-id if omitted)
  -p, --placeholder string Placeholder text
      --types string     Generate types to file (default: "prismicio-types.d.ts")
      --no-types         Skip type generation
  -h, --help             Show help for command

EXAMPLES
  prismic slice add-field color my_slice background_color
  prismic slice add-field color hero accent --label "Accent Color"
  prismic slice add-field color banner theme_color --variation "dark"
`.trim();

export async function sliceAddFieldColor(): Promise<void> {
	const {
		values: { help, repo: repoFlag, variation, label, placeholder, types, "no-types": noTypes },
		positionals: [sliceId, fieldId],
	} = parseArgs({
		args: process.argv.slice(5), // skip: node, script, "slice", "add-field", "color"
		options: {
			repo: { type: "string", short: "r" },
			variation: { type: "string", short: "v" },
			label: { type: "string", short: "l" },
			placeholder: { type: "string", short: "p" },
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

	if (!sliceId) {
		console.error("Missing required argument: slice-id\n");
		console.error("Usage: prismic slice add-field color <slice-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic slice add-field color <slice-id> <field-id>");
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

	const fetchResult = await fetchSlice(repo, sliceId);
	if (!fetchResult.ok) {
		console.error(fetchResult.error);
		process.exitCode = 1;
		return;
	}

	const model = fetchResult.value;

	// Check for variations
	if (model.variations.length === 0) {
		console.error(`Slice "${sliceId}" has no variations.\n`);
		console.error("Add a variation first before adding fields.");
		process.exitCode = 1;
		return;
	}

	// Find target variation
	const targetVariation = variation
		? model.variations.find((v) => v.id === variation)
		: model.variations[0];

	if (!targetVariation) {
		console.error(`Variation "${variation}" not found in slice "${sliceId}"\n`);
		console.error(`Available variations: ${model.variations.map((v) => v.id).join(", ")}`);
		process.exitCode = 1;
		return;
	}

	// Initialize primary if it doesn't exist
	if (!targetVariation.primary) {
		targetVariation.primary = {};
	}

	// Check if field already exists in any variation
	for (const v of model.variations) {
		if (v.primary?.[fieldId]) {
			console.error(`Field "${fieldId}" already exists in variation "${v.id}"`);
			process.exitCode = 1;
			return;
		}
	}

	// Build field definition
	const fieldDefinition: Color = {
		type: "Color",
		config: {
			label: label ?? humanReadable(fieldId),
			...(placeholder && { placeholder }),
		},
	};

	// Add field to variation
	targetVariation.primary[fieldId] = fieldDefinition;

	// Update remote slice
	const updateResult = await updateSlice(repo, model);
	if (!updateResult.ok) {
		console.error(`Failed to update slice: ${updateResult.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(
		`Added field "${fieldId}" (Color) to "${targetVariation.id}" variation in ${sliceId}`,
	);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}
