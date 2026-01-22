import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchSlice, updateSlice } from "./lib/custom-types-api";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Remove a field from a slice variation.

USAGE
  prismic slice remove-field <slice-id> <field-id> [flags]

ARGUMENTS
  slice-id     Slice identifier (required)
  field-id     Field identifier (required)

FLAGS
  -r, --repo string        Repository domain
  --variation string       Target variation (default: "default")
  --zone string            Field zone: "primary" or "items" (default: "primary")
      --types string       Generate types to file (default: "prismicio-types.d.ts")
      --no-types           Skip type generation
  -h, --help               Show help for command

EXAMPLES
  prismic slice remove-field MySlice title
  prismic slice remove-field MySlice title --variation withImage
  prismic slice remove-field MySlice item_title --zone items
  prismic slice remove-field MySlice title --repo my-repo
`.trim();

export async function sliceRemoveField(): Promise<void> {
	const {
		values: { help, variation, zone, repo: repoFlag, types, "no-types": noTypes },
		positionals: [sliceId, fieldId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "remove-field"
		options: {
			repo: { type: "string", short: "r" },
			variation: { type: "string", default: "default" },
			zone: { type: "string", default: "primary" },
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
		console.error("Usage: prismic slice remove-field <slice-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic slice remove-field <slice-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (zone !== "primary" && zone !== "items") {
		console.error(`Invalid zone: ${zone}. Must be "primary" or "items".`);
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

	// Find the variation
	const targetVariation = model.variations.find((v) => v.id === variation);
	if (!targetVariation) {
		console.error(`Variation not found: ${variation}`);
		console.error(`Available variations: ${model.variations.map((v) => v.id).join(", ")}`);
		process.exitCode = 1;
		return;
	}

	// Check if field exists
	const zoneFields = zone === "primary" ? targetVariation.primary : targetVariation.items;
	if (!zoneFields || !(fieldId in zoneFields)) {
		console.error(`Field "${fieldId}" not found in ${zone} zone of variation "${variation}"`);
		process.exitCode = 1;
		return;
	}

	// Remove the field
	delete zoneFields[fieldId];

	const updateResult = await updateSlice(repo, model);
	if (!updateResult.ok) {
		console.error(`Failed to update slice: ${updateResult.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(
		`Removed field "${fieldId}" from ${zone} zone in variation "${variation}" of slice "${sliceId}"`,
	);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}
