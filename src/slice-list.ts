import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemoteSlices } from "./lib/custom-types-api";

const HELP = `
List all slices in a Prismic repository.

USAGE
  prismic slice list [flags]

FLAGS
  -r, --repo string   Repository domain
  --json              Output as JSON
  -h, --help          Show help for command

EXAMPLES
  prismic slice list
  prismic slice list --json
  prismic slice list --repo my-repo
`.trim();

export async function sliceList(): Promise<void> {
	const {
		values: { help, json, repo: repoFlag },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "list"
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

	const fetchResult = await fetchRemoteSlices(repo);
	if (!fetchResult.ok) {
		console.error(fetchResult.error);
		process.exitCode = 1;
		return;
	}

	const slices = fetchResult.value.map((s) => ({ id: s.id, name: s.name }));

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
