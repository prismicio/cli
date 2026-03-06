import type { CustomType, DynamicSlices } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { requireFramework } from "./framework";

const HELP = `
Disconnect a shared slice from a custom type's slice zone.

USAGE
  prismic custom-type disconnect-slice <type-id> <slice-id> [flags]

ARGUMENTS
  type-id                Custom type identifier (required)
  slice-id               Slice identifier (required)

FLAGS
  -z, --slice-zone string  Target slice zone field ID (default: "slices")
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help               Show help for command

EXAMPLES
  prismic custom-type disconnect-slice homepage CallToAction
  prismic custom-type disconnect-slice homepage CallToAction --slice-zone slices
  prismic custom-type disconnect-slice article HeroSection -z body
`.trim();

export async function customTypeDisconnectSlice(): Promise<void> {
	const {
		values: { help, "slice-zone": sliceZoneId, types },
		positionals: [typeId, sliceId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "custom-type", "disconnect-slice"
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
		console.error("Usage: prismic custom-type disconnect-slice <type-id> <slice-id>");
		process.exitCode = 1;
		return;
	}

	if (!sliceId) {
		console.error("Missing required argument: slice-id\n");
		console.error("Usage: prismic custom-type disconnect-slice <type-id> <slice-id>");
		process.exitCode = 1;
		return;
	}

	const framework = await requireFramework();
	if (!framework) return;

	let model: CustomType;
	try {
		model = await framework.readCustomType(typeId);
	} catch {
		console.error(`Custom type not found: ${typeId}\n\nCreate it first with: prismic custom-type create ${typeId}`);
		process.exitCode = 1;
		return;
	}

	const targetSliceZoneId = sliceZoneId ?? "slices";

	// Find existing slice zone
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

	// Slice zone must exist for disconnect
	if (!sliceZone) {
		console.error(`Slice zone "${targetSliceZoneId}" not found in custom type "${typeId}"`);
		process.exitCode = 1;
		return;
	}

	// Check if slice is connected
	if (!sliceZone.config?.choices || !(sliceId in sliceZone.config.choices)) {
		console.error(
			`Slice "${sliceId}" is not connected to slice zone "${sliceZoneFieldId}" in ${typeId}`,
		);
		process.exitCode = 1;
		return;
	}

	// Remove the slice reference
	delete sliceZone.config.choices[sliceId];

	// Write updated model
	try {
		await framework.updateCustomType(model);
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
		`Disconnected slice "${sliceId}" from slice zone "${sliceZoneFieldId}" in ${typeId}`,
	);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}
}
