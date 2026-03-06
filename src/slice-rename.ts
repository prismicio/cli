import type { SharedSliceModel } from "@prismicio/client";

import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { requireFramework } from "./lib/framework-adapter";

const HELP = `
Rename a slice (updates name field, optionally id and directory).

USAGE
  prismic slice rename <slice-id> <new-name> [flags]

ARGUMENTS
  slice-id     Current slice identifier (required)
  new-name     New display name (required)

FLAGS
  --id string  Also change the slice ID (renames directory)
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help   Show help for command

EXAMPLES
  prismic slice rename MySlice "My New Name"
  prismic slice rename MySlice "My New Name" --id NewSliceId
`.trim();

export async function sliceRename(): Promise<void> {
	const {
		values: { help, id: newId, types },
		positionals: [sliceId, newName],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "rename"
		options: {
			id: { type: "string" },
			types: { type: "string" },
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
		console.error("Usage: prismic slice rename <slice-id> <new-name>");
		process.exitCode = 1;
		return;
	}

	if (!newName) {
		console.error("Missing required argument: new-name\n");
		console.error("Usage: prismic slice rename <slice-id> <new-name>");
		process.exitCode = 1;
		return;
	}

	const framework = await requireFramework();
	if (!framework) return;

	let model;
	try {
		model = await framework.readSlice(sliceId);
	} catch {
		console.error(`Slice not found: ${sliceId}\n\nCreate it first with: prismic slice create ${sliceId}`);
		process.exitCode = 1;
		return;
	}

	// Update the model
	model.name = newName;
	if (newId) {
		model.id = newId;
	}

	// Write updated model (renameSlice handles directory rename)
	try {
		if (newId) {
			await framework.renameSlice(model as unknown as SharedSliceModel);
			console.info(`Renamed slice "${sliceId}" to "${newId}" (${newName})`);
		} else {
			await framework.updateSlice(model as unknown as SharedSliceModel);
			console.info(`Renamed slice "${sliceId}" to "${newName}"`);
		}
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to update slice: ${error.message}`);
		} else {
			console.error("Failed to update slice");
		}
		process.exitCode = 1;
		return;
	}

	try {
		await buildTypes({ output: types, framework });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}
}
