import type {
	CustomType,
	DynamicSlices,
	SharedSliceRef,
} from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemoteCustomType, fetchSlice, updateCustomType } from "./lib/custom-types-api";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Connect a shared slice to a custom type's slice zone.

USAGE
  prismic custom-type connect-slice <type-id> <slice-id> [flags]

ARGUMENTS
  type-id                Custom type identifier (required)
  slice-id               Slice identifier (required)

FLAGS
  -r, --repo string        Repository domain
  -z, --slice-zone string  Target slice zone field ID (default: "slices")
      --types string       Generate types to file (default: "prismicio-types.d.ts")
      --no-types           Skip type generation
  -h, --help               Show help for command

EXAMPLES
  prismic custom-type connect-slice homepage CallToAction
  prismic custom-type connect-slice homepage CallToAction --slice-zone slices
  prismic custom-type connect-slice article HeroSection -z body
`.trim();

export async function customTypeConnectSlice(): Promise<void> {
	const {
		values: { help, repo: repoFlag, "slice-zone": sliceZoneId, types, "no-types": noTypes },
		positionals: [typeId, sliceId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "custom-type", "connect-slice"
		options: {
			repo: { type: "string", short: "r" },
			"slice-zone": { type: "string", short: "z" },
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

	// Verify the slice exists on remote
	const sliceResult = await fetchSlice(repo, sliceId);
	if (!sliceResult.ok) {
		console.error(sliceResult.error);
		process.exitCode = 1;
		return;
	}

	// Fetch the custom type
	const fetchResult = await fetchRemoteCustomType(repo, typeId);
	if (!fetchResult.ok) {
		console.error(fetchResult.error);
		process.exitCode = 1;
		return;
	}

	const model: CustomType = fetchResult.value;
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

	const updateResult = await updateCustomType(repo, model);
	if (!updateResult.ok) {
		console.error(`Failed to update custom type: ${updateResult.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(`Connected slice "${sliceId}" to slice zone "${sliceZoneFieldId}" in ${typeId}`);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}
