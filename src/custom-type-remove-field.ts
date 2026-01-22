import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemoteCustomType, updateCustomType } from "./lib/custom-types-api";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Remove a field from a custom type.

USAGE
  prismic custom-type remove-field <type-id> <field-id> [flags]

ARGUMENTS
  type-id      Custom type identifier (required)
  field-id     Field identifier (required)

FLAGS
  -r, --repo string   Repository domain
      --tab string    Specific tab (searches all tabs if not specified)
      --types string  Generate types to file (default: "prismicio-types.d.ts")
      --no-types      Skip type generation
  -h, --help          Show help for command

EXAMPLES
  prismic custom-type remove-field settings title
  prismic custom-type remove-field settings description --tab "Content"
  prismic custom-type remove-field settings title --repo my-repo
`.trim();

export async function customTypeRemoveField(): Promise<void> {
	const {
		values: { help, tab, repo: repoFlag, types, "no-types": noTypes },
		positionals: [typeId, fieldId],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "custom-type", "remove-field"
		options: {
			repo: { type: "string", short: "r" },
			tab: { type: "string" },
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
		console.error("Usage: prismic custom-type remove-field <type-id> <field-id>");
		process.exitCode = 1;
		return;
	}

	if (!fieldId) {
		console.error("Missing required argument: field-id\n");
		console.error("Usage: prismic custom-type remove-field <type-id> <field-id>");
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

	// Find and remove the field
	let foundTab: string | undefined;

	if (tab) {
		// Look in specific tab
		if (!model.json[tab]) {
			console.error(`Tab "${tab}" not found in custom type "${typeId}"`);
			console.error(`Available tabs: ${Object.keys(model.json).join(", ")}`);
			process.exitCode = 1;
			return;
		}
		if (!(fieldId in model.json[tab])) {
			console.error(`Field "${fieldId}" not found in tab "${tab}"`);
			process.exitCode = 1;
			return;
		}
		delete model.json[tab][fieldId];
		foundTab = tab;
	} else {
		// Search all tabs
		for (const [tabName, tabFields] of Object.entries(model.json)) {
			if (fieldId in tabFields) {
				delete tabFields[fieldId];
				foundTab = tabName;
				break;
			}
		}
		if (!foundTab) {
			console.error(`Field "${fieldId}" not found in any tab of custom type "${typeId}"`);
			process.exitCode = 1;
			return;
		}
	}

	const updateResult = await updateCustomType(repo, model);
	if (!updateResult.ok) {
		console.error(`Failed to update custom type: ${updateResult.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(`Removed field "${fieldId}" from tab "${foundTab}" in custom type "${typeId}"`);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}
