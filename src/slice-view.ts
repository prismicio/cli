import { parseArgs } from "node:util";

import { findSliceModel } from "./lib/slice";

const HELP = `
View details of a specific slice.

USAGE
  prismic slice view <slice-id> [flags]

ARGUMENTS
  slice-id     Slice identifier (required)

FLAGS
  --json       Output as JSON
  -h, --help   Show help for command

EXAMPLES
  prismic slice view MySlice
  prismic slice view MySlice --json
`.trim();

export async function sliceView(): Promise<void> {
	const {
		values: { help, json },
		positionals: [sliceId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "view"
		options: {
			json: { type: "boolean" },
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
		console.error("Usage: prismic slice view <slice-id>");
		process.exitCode = 1;
		return;
	}

	const result = await findSliceModel(sliceId);
	if (!result.ok) {
		console.error(result.error);
		process.exitCode = 1;
		return;
	}

	const { model } = result;

	if (json) {
		console.info(JSON.stringify(model, null, 2));
		return;
	}

	console.info(`ID:           ${model.id}`);
	console.info(`Name:         ${model.name}`);
	if (model.description) {
		console.info(`Description:  ${model.description}`);
	}
	console.info(`Variations:   ${model.variations.length}`);

	console.info("\nVariations:");
	for (const variation of model.variations) {
		const primaryFields = Object.keys(variation.primary ?? {}).length;
		const itemsFields = Object.keys(variation.items ?? {}).length;
		console.info(
			`  - ${variation.id} (${variation.name}): ${primaryFields} primary fields, ${itemsFields} items fields`,
		);
	}
}
