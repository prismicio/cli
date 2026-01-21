import { rename, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { stringify } from "./lib/json";
import { findSliceModel, getSlicesDirectory, pascalCase } from "./lib/slice";

const HELP = `
Rename a slice (updates name field, optionally id and directory).

USAGE
  prismic slice rename <slice-id> <new-name> [flags]

ARGUMENTS
  slice-id     Current slice identifier (required)
  new-name     New display name (required)

FLAGS
  --id string  Also change the slice ID (renames directory)
  -h, --help   Show help for command

EXAMPLES
  prismic slice rename MySlice "My New Name"
  prismic slice rename MySlice "My New Name" --id NewSliceId
`.trim();

export async function sliceRename(): Promise<void> {
	const {
		values: { help, id: newId },
		positionals: [sliceId, newName],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "rename"
		options: {
			id: { type: "string" },
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

	const result = await findSliceModel(sliceId);
	if (!result.ok) {
		console.error(result.error);
		process.exitCode = 1;
		return;
	}

	const { model, modelPath } = result;

	// Update the model
	model.name = newName;
	if (newId) {
		model.id = newId;
	}

	// Write updated model
	try {
		await writeFile(modelPath, stringify(model));
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to update slice: ${error.message}`);
		} else {
			console.error("Failed to update slice");
		}
		process.exitCode = 1;
		return;
	}

	// If changing ID, also rename the directory
	if (newId) {
		const slicesDirectory = await getSlicesDirectory();
		const currentDir = new URL(".", modelPath);
		const newDir = new URL(pascalCase(newName) + "/", slicesDirectory);

		if (currentDir.href !== newDir.href) {
			try {
				await rename(currentDir, newDir);
				console.info(`Renamed slice "${sliceId}" to "${newId}" (${newName})`);
				console.info(`Moved directory to ${newDir.href}`);
			} catch (error) {
				if (error instanceof Error) {
					console.error(`Failed to rename directory: ${error.message}`);
				} else {
					console.error("Failed to rename directory");
				}
				process.exitCode = 1;
				return;
			}
		} else {
			console.info(`Renamed slice "${sliceId}" to "${newId}" (${newName})`);
		}
	} else {
		console.info(`Renamed slice "${sliceId}" to "${newName}"`);
	}
}
