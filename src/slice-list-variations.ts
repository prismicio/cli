import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchSlice } from "./lib/custom-types-api";

const HELP = `
List all variations for a slice.

USAGE
  prismic slice list-variations <slice-id> [flags]

ARGUMENTS
  slice-id     Slice identifier (required)

FLAGS
  -r, --repo string   Repository domain
  --json              Output as JSON
  -h, --help          Show help for command

EXAMPLES
  prismic slice list-variations MySlice
  prismic slice list-variations MySlice --json
  prismic slice list-variations MySlice --repo my-repo
`.trim();

export async function sliceListVariations(): Promise<void> {
	const {
		values: { help, json, repo: repoFlag },
		positionals: [sliceId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "list-variations"
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
		console.error("Usage: prismic slice list-variations <slice-id>");
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
