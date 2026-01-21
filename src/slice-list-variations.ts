import { parseArgs } from "node:util";

import { findSliceModel } from "./lib/slice";

const HELP = `
List all variations for a slice.

USAGE
  prismic slice list-variations <slice-id> [flags]

ARGUMENTS
  slice-id     Slice identifier (required)

FLAGS
  --json       Output as JSON
  -h, --help   Show help for command

EXAMPLES
  prismic slice list-variations MySlice
  prismic slice list-variations MySlice --json
`.trim();

export async function sliceListVariations(): Promise<void> {
	const {
		values: { help, json },
		positionals: [sliceId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "list-variations"
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
		console.error("Usage: prismic slice list-variations <slice-id>");
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
	const variations = model.variations.map((v) => ({ id: v.id, name: v.name }));

	if (json) {
		console.info(JSON.stringify(variations, null, 2));
		return;
	}

	console.info("ID\tNAME");
	for (const variation of variations) {
		console.info(`${variation.id}\t${variation.name}`);
	}
}
