import { parseArgs } from "node:util";

import { requireFramework } from "./lib/framework-adapter";

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
