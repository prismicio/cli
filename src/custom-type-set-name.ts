import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemoteCustomType, updateCustomType } from "./lib/custom-types-api";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Change a custom type's display name (label).

USAGE
  prismic custom-type set-name <type-id> <new-name> [flags]

ARGUMENTS
  type-id      Custom type identifier (required)
  new-name     New display name (required)

FLAGS
  -r, --repo string   Repository domain
      --types string  Generate types to file (default: "prismicio-types.d.ts")
      --no-types      Skip type generation
  -h, --help          Show help for command

EXAMPLES
  prismic custom-type set-name settings "Site Settings"
  prismic custom-type set-name menu "Navigation Menu"
  prismic custom-type set-name settings "Site Settings" --repo my-repo
`.trim();

export async function customTypeSetName(): Promise<void> {
	const {
		values: { help, repo: repoFlag, types, "no-types": noTypes },
		positionals: [typeId, newName],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "custom-type", "set-name"
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
		console.error("Usage: prismic custom-type set-name <type-id> <new-name>");
		process.exitCode = 1;
		return;
	}

	if (!newName) {
		console.error("Missing required argument: new-name\n");
		console.error("Usage: prismic custom-type set-name <type-id> <new-name>");
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

	const fetchResult = await fetchRemoteCustomType(repo, typeId);
	if (!fetchResult.ok) {
		console.error(fetchResult.error);
		process.exitCode = 1;
		return;
	}

	const model = fetchResult.value;
	model.label = newName;

	const updateResult = await updateCustomType(repo, model);
	if (!updateResult.ok) {
		console.error(`Failed to update custom type: ${updateResult.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(`Renamed custom type "${typeId}" to "${newName}"`);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}
