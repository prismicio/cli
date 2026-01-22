import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemotePageType, updateCustomType } from "./lib/custom-types-api";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Set whether a page type is repeatable.

USAGE
  prismic page-type set-repeatable <type-id> <true|false> [flags]

ARGUMENTS
  type-id       Page type identifier (required)
  true|false    Repeatable value (required)

FLAGS
  -r, --repo string   Repository domain
      --types string  Generate types to file (default: "prismicio-types.d.ts")
      --no-types      Skip type generation
  -h, --help          Show help for command

EXAMPLES
  prismic page-type set-repeatable homepage true
  prismic page-type set-repeatable settings false
  prismic page-type set-repeatable homepage true --repo my-repo
`.trim();

export async function pageTypeSetRepeatable(): Promise<void> {
	const {
		values: { help, repo: repoFlag, types, "no-types": noTypes },
		positionals: [typeId, repeatableValue],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "set-repeatable"
		options: {
			repo: { type: "string", short: "r" },
			types: { type: "string" },
			"no-types": { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!typeId) {
		console.error("Missing required argument: type-id\n");
		console.error("Usage: prismic page-type set-repeatable <type-id> <true|false>");
		process.exitCode = 1;
		return;
	}

	if (!repeatableValue) {
		console.error("Missing required argument: true|false\n");
		console.error("Usage: prismic page-type set-repeatable <type-id> <true|false>");
		process.exitCode = 1;
		return;
	}

	if (repeatableValue !== "true" && repeatableValue !== "false") {
		console.error(`Invalid value: "${repeatableValue}". Must be "true" or "false".`);
		process.exitCode = 1;
		return;
	}

	const repeatable = repeatableValue === "true";

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

	const fetchResult = await fetchRemotePageType(repo, typeId);
	if (!fetchResult.ok) {
		console.error(fetchResult.error);
		process.exitCode = 1;
		return;
	}

	const model = fetchResult.value;
	model.repeatable = repeatable;

	const updateResult = await updateCustomType(repo, model);
	if (!updateResult.ok) {
		console.error(`Failed to update page type: ${updateResult.error}`);
		process.exitCode = 1;
		return;
	}

	const typeLabel = repeatable ? "repeatable" : "singleton";
	console.info(`Set page type "${typeId}" to ${typeLabel}`);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}
