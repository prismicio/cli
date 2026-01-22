import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemoteNonPageCustomTypes } from "./lib/custom-types-api";

const HELP = `
List all custom types in a Prismic repository.

USAGE
  prismic custom-type list [flags]

FLAGS
  -r, --repo string   Repository domain
      --json          Output as JSON
  -h, --help          Show help for command

EXAMPLES
  prismic custom-type list
  prismic custom-type list --json
  prismic custom-type list --repo my-repo
`.trim();

export async function customTypeList(): Promise<void> {
	const {
		values: { help, json, repo: repoFlag },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "custom-type", "list"
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

	const result = await fetchRemoteNonPageCustomTypes(repo);
	if (!result.ok) {
		console.error(result.error);
		process.exitCode = 1;
		return;
	}

	const customTypes = result.value;

	if (customTypes.length === 0) {
		if (json) {
			console.info(JSON.stringify([]));
		} else {
			console.info("No custom types found.");
		}
		return;
	}

	if (json) {
		console.info(
			JSON.stringify(
				customTypes.map((ct) => ({
					id: ct.id,
					label: ct.label,
					repeatable: ct.repeatable,
				})),
				null,
				2,
			),
		);
	} else {
		console.info("ID\tLABEL\tTYPE");
		for (const customType of customTypes) {
			const typeLabel = customType.repeatable ? "repeatable" : "singleton";
			console.info(`${customType.id}\t${customType.label}\t${typeLabel}`);
		}
	}
}
