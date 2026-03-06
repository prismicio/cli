import { parseArgs } from "node:util";

import { requireFramework } from "./framework";

const HELP = `
List all slices in a Prismic project.

USAGE
  prismic slice list [flags]

FLAGS
  --json       Output as JSON
  -h, --help   Show help for command

EXAMPLES
  prismic slice list
  prismic slice list --json
`.trim();

export async function sliceList(): Promise<void> {
	const {
		values: { help, json },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "list"
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

	const framework = await requireFramework();
	if (!framework) return;

	const sliceResults = await framework.getSlices();
	const slices = sliceResults.map((s) => ({ id: s.model.id, name: s.model.name }));

	if (slices.length === 0) {
		if (json) {
			console.info(JSON.stringify([]));
		} else {
			console.info("No slices found.");
		}
		return;
	}

	if (json) {
		console.info(JSON.stringify(slices, null, 2));
	} else {
		console.info("ID\tNAME");
		for (const slice of slices) {
			console.info(`${slice.id}\t${slice.name}`);
		}
	}
}
