import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { requireFramework } from "./framework";

const HELP = `
Remove a slice from the project.

USAGE
  prismic slice remove <slice-id> [flags]

ARGUMENTS
  slice-id     Slice identifier (required)

FLAGS
  -y           Confirm removal
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help   Show help for command

EXAMPLES
  prismic slice remove MySlice
  prismic slice remove MySlice -y
`.trim();

export async function sliceRemove(): Promise<void> {
	const {
		values: { help, y, types },
		positionals: [sliceId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "remove"
		options: {
			y: { type: "boolean", short: "y" },
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
		console.error("Usage: prismic slice remove <slice-id>");
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

	// Require -y flag to confirm deletion
	if (!y) {
		console.error(`Refusing to remove slice "${sliceId}" (this will delete the entire directory).`);
		console.error("Re-run with -y to confirm.");
		process.exitCode = 1;
		return;
	}

	// Delete the slice directory
	try {
		await framework.deleteSlice(sliceId);
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

	try {
		await buildTypes({ output: types, framework });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}
}
