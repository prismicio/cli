import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchSlice } from "./lib/custom-types-api";

const HELP = `
View details of a specific slice.

USAGE
  prismic slice view <slice-id> [flags]

ARGUMENTS
  slice-id     Slice identifier (required)

FLAGS
  -r, --repo string   Repository domain
  --json              Output as JSON
  -h, --help          Show help for command

EXAMPLES
  prismic slice view MySlice
  prismic slice view MySlice --json
  prismic slice view MySlice --repo my-repo
`.trim();

export async function sliceView(): Promise<void> {
	const {
		values: { help, json, repo: repoFlag },
		positionals: [sliceId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "view"
		options: {
			repo: { type: "string", short: "r" },
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

	const fetchResult = await fetchSlice(repo, sliceId);
	if (!fetchResult.ok) {
		console.error(fetchResult.error);
		process.exitCode = 1;
		return;
	}

	const model = fetchResult.value;

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
