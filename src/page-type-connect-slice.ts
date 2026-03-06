import type {
	CustomType,
	DynamicSlices,
	SharedSliceRef,
} from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { requireFramework } from "./lib/framework-adapter";

const HELP = `
Connect a shared slice to a page type's slice zone.

USAGE
  prismic page-type connect-slice <type-id> <slice-id> [flags]

ARGUMENTS
  type-id                Page type identifier (required)
  slice-id               Slice identifier (required)

FLAGS
  -z, --slice-zone string  Target slice zone field ID (default: "slices")
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help               Show help for command

EXAMPLES
  prismic page-type connect-slice homepage CallToAction
  prismic page-type connect-slice homepage CallToAction --slice-zone slices
  prismic page-type connect-slice article HeroSection -z body
`.trim();

export async function pageTypeConnectSlice(): Promise<void> {
	const {
		values: { help, "slice-zone": sliceZoneId, types },
		positionals: [typeId, sliceId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "connect-slice"
		options: {
			"slice-zone": { type: "string", short: "z" },
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
		console.error("Usage: prismic page-type connect-slice <type-id> <slice-id>");
		process.exitCode = 1;
		return;
	}

	if (!sliceId) {
		console.error("Missing required argument: slice-id\n");
		console.error("Usage: prismic page-type connect-slice <type-id> <slice-id>");
		process.exitCode = 1;
		return;
	}

	const framework = await requireFramework();
	if (!framework) return;

	// Verify the slice exists
	try {
		await framework.readSlice(sliceId);
	} catch {
		console.error(`Slice not found: ${sliceId}\n\nCreate it first with: prismic slice create ${sliceId}`);
		process.exitCode = 1;
		return;
	}

	// Read the page type model
	let model: CustomType;
	try {
		model = await framework.readCustomType(typeId);
	} catch {
		console.error(`Page type not found: ${typeId}\n\nCreate it first with: prismic page-type create ${typeId}`);
		process.exitCode = 1;
		return;
	}

	const targetSliceZoneId = sliceZoneId ?? "slices";

	// Find existing slice zone or create a new one
	let sliceZone: DynamicSlices | undefined;
	let sliceZoneFieldId: string | undefined;

	// Search all tabs for a Slices field matching the target ID
	for (const [, tabFields] of Object.entries(model.json)) {
		for (const [fieldId, field] of Object.entries(tabFields)) {
			if ((field as { type?: string }).type === "Slices" && fieldId === targetSliceZoneId) {
				sliceZone = field as DynamicSlices;
				sliceZoneFieldId = fieldId;
				break;
			}
		}
		if (sliceZone) break;
	}

	// Handle slice zone not found
	if (!sliceZone) {
		if (sliceZoneId) {
			// User specified a slice zone that doesn't exist
			console.error(`Slice zone "${sliceZoneId}" not found in page type "${typeId}"`);
			process.exitCode = 1;
			return;
		}

		// Create a new slice zone in the first tab
		const existingTabs = Object.keys(model.json);
		const targetTab = existingTabs[0] ?? "Main";

		// Initialize tab if it doesn't exist
		if (!model.json[targetTab]) {
			model.json[targetTab] = {};
		}

		const newSliceZone: DynamicSlices = {
			type: "Slices",
			fieldset: "Slice Zone",
			config: {
				choices: {},
			},
		};

		model.json[targetTab][targetSliceZoneId] = newSliceZone;
		sliceZone = newSliceZone;
		sliceZoneFieldId = targetSliceZoneId;
	}

	// Ensure config and choices exist
	if (!sliceZone.config) {
		sliceZone.config = { choices: {} };
	}
	if (!sliceZone.config.choices) {
		sliceZone.config.choices = {};
	}

	// Check if slice is already connected
	if (sliceId in sliceZone.config.choices) {
		console.info(
			`Slice "${sliceId}" is already connected to slice zone "${sliceZoneFieldId}" in ${typeId}`,
		);
		return;
	}

	// Add the slice reference
	const sliceRef: SharedSliceRef = { type: "SharedSlice" };
	sliceZone.config.choices[sliceId] = sliceRef;

	// Write updated model
	try {
		await framework.updateCustomType(model);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to update page type: ${error.message}`);
		} else {
			console.error("Failed to update page type");
		}
		process.exitCode = 1;
		return;
	}

	console.info(`Connected slice "${sliceId}" to slice zone "${sliceZoneFieldId}" in ${typeId}`);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}
}
