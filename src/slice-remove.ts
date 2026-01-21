import { rm } from "node:fs/promises";
import { parseArgs } from "node:util";

import { findSliceModel } from "./lib/slice";

const HELP = `
Remove a slice from the project.

USAGE
  prismic slice remove <slice-id> [flags]

ARGUMENTS
  slice-id     Slice identifier (required)

FLAGS
  -y           Confirm removal
  -h, --help   Show help for command

EXAMPLES
  prismic slice remove MySlice
  prismic slice remove MySlice -y
`.trim();

export async function sliceRemove(): Promise<void> {
	const {
		values: { help, y },
		positionals: [sliceId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "remove"
		options: {
			y: { type: "boolean", short: "y" },
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
		console.error("Usage: prismic slice remove <slice-id>");
		process.exitCode = 1;
		return;
	}

	const result = await findSliceModel(sliceId);
	if (!result.ok) {
		console.error(result.error);
		process.exitCode = 1;
		return;
	}

	const { modelPath } = result;
	const sliceDirectory = new URL(".", modelPath);

	// Require -y flag to confirm deletion
	if (!y) {
		console.error(`Refusing to remove slice "${sliceId}" (this will delete the entire directory).`);
		console.error("Re-run with -y to confirm.");
		process.exitCode = 1;
		return;
	}

	// Delete the slice directory
	try {
		await rm(sliceDirectory, { recursive: true });
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to remove slice: ${error.message}`);
		} else {
			console.error("Failed to remove slice");
		}
		process.exitCode = 1;
		return;
	}

	console.info(`Removed slice "${sliceId}"`);
}
