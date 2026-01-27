import type {
	CustomType,
	DynamicSlices,
	SharedSliceRef,
} from "@prismicio/types-internal/lib/customtypes";

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { buildTypes } from "./codegen-types";
import { findUpward } from "./lib/file";
import { stringify } from "./lib/json";
import { findSliceModel } from "./lib/slice";

const HELP = `
Connect a shared slice to a custom type's slice zone.

USAGE
  prismic custom-type connect-slice <type-id> <slice-id> [flags]

ARGUMENTS
  type-id                Custom type identifier (required)
  slice-id               Slice identifier (required)

FLAGS
  -z, --slice-zone string  Target slice zone field ID (default: "slices")
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help               Show help for command

EXAMPLES
  prismic custom-type connect-slice homepage CallToAction
  prismic custom-type connect-slice homepage CallToAction --slice-zone slices
  prismic custom-type connect-slice article HeroSection -z body
`.trim();

const CustomTypeSchema = v.object({
	id: v.string(),
	label: v.string(),
	repeatable: v.boolean(),
	status: v.boolean(),
	format: v.string(),
	json: v.record(v.string(), v.record(v.string(), v.unknown())),
});

export async function customTypeConnectSlice(): Promise<void> {
	const {
		values: { help, "slice-zone": sliceZoneId, types },
		positionals: [typeId, sliceId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "custom-type", "connect-slice"
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
		console.error("Usage: prismic custom-type connect-slice <type-id> <slice-id>");
		process.exitCode = 1;
		return;
	}

	if (!sliceId) {
		console.error("Missing required argument: slice-id\n");
		console.error("Usage: prismic custom-type connect-slice <type-id> <slice-id>");
		process.exitCode = 1;
		return;
	}

	// Verify the slice exists
	const sliceResult = await findSliceModel(sliceId);
	if (!sliceResult.ok) {
		console.error(sliceResult.error);
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
			console.error(`Slice zone "${sliceZoneId}" not found in custom type "${typeId}"`);
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

	console.info(`Connected slice "${sliceId}" to slice zone "${sliceZoneFieldId}" in ${typeId}`);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}
}
