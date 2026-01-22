import type { CustomType, DynamicSlices } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemoteCustomType, updateCustomType } from "./lib/custom-types-api";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Disconnect a shared slice from a custom type's slice zone.

USAGE
  prismic custom-type disconnect-slice <type-id> <slice-id> [flags]

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
  prismic custom-type disconnect-slice homepage CallToAction
  prismic custom-type disconnect-slice homepage CallToAction --slice-zone slices
  prismic custom-type disconnect-slice article HeroSection -z body
`.trim();

export async function customTypeDisconnectSlice(): Promise<void> {
	const {
		values: { help, repo: repoFlag, "slice-zone": sliceZoneId, types, "no-types": noTypes },
		positionals: [typeId, sliceId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "custom-type", "disconnect-slice"
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

	const updateResult = await updateCustomType(repo, model);
	if (!updateResult.ok) {
		console.error(`Failed to update custom type: ${updateResult.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(
		`Disconnected slice "${sliceId}" from slice zone "${sliceZoneFieldId}" in ${typeId}`,
	);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}
