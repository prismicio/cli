import { readdir, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { getSlicesDirectory, SharedSliceSchema } from "./lib/slice";

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

	const slicesDirectory = await getSlicesDirectory();

	let entries: string[];
	try {
		entries = (await readdir(slicesDirectory, {
			withFileTypes: false,
		})) as unknown as string[];
	} catch {
		if (json) {
			console.info(JSON.stringify([]));
		} else {
			console.info("No slices found.");
		}
		return;
	}

	const slices: { id: string; name: string }[] = [];

	for (const entry of entries) {
		const modelPath = new URL(`${entry}/model.json`, slicesDirectory);
		try {
			const contents = await readFile(modelPath, "utf8");
			const parsed = JSON.parse(contents);
			const result = v.safeParse(SharedSliceSchema, parsed);
			if (result.success) {
				slices.push({ id: result.output.id, name: result.output.name });
			}
		} catch {
			// Skip directories without valid model.json
		}
	}

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
