import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { insertSlice } from "./lib/custom-types-api";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Create a new slice in a Prismic repository.

USAGE
  prismic slice create <id> [flags]

ARGUMENTS
  id       Slice identifier (required)

FLAGS
  -r, --repo string   Repository domain
  -n, --name string   Display name for the slice
      --types string  Generate types to file (default: "prismicio-types.d.ts")
      --no-types      Skip type generation
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic slice <command> --help\` for more information about a command.
`.trim();

export async function sliceCreate(): Promise<void> {
	const {
		values: { help, name, repo: repoFlag, types, "no-types": noTypes },
		positionals: [id],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "create"
		options: {
			repo: { type: "string", short: "r" },
			name: { type: "string", short: "n" },
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

	if (!id) {
		console.error("Missing required argument: id");
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

	const model: SharedSlice = {
		id,
		type: "SharedSlice",
		name: name ?? pascalCase(id),
		description: "",
		variations: [
			{
				id: "default",
				name: "Default",
				description: "Default",
				imageUrl: "",
				docURL: "",
				version: "initial",
				primary: {},
				items: {},
			},
		],
	};

	const insertResult = await insertSlice(repo, model);
	if (!insertResult.ok) {
		console.error(`Failed to create slice: ${insertResult.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(`Created slice "${id}" in repository "${repo}"`);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}

function pascalCase(input: string): string {
	return input.toLowerCase().replace(/(^|[-_\s]+)(.)?/g, (_, __, c) => c?.toUpperCase() ?? "");
}
