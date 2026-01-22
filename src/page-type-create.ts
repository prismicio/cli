import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { insertCustomType } from "./lib/custom-types-api";
import { generateTypesFile } from "./codegen-types";

const HELP = `
Create a new page type in a Prismic repository.

USAGE
  prismic page-type create <id> [flags]

ARGUMENTS
  id       Page type identifier (required)

FLAGS
  -r, --repo string   Repository domain
  -n, --name string   Display name for the page type
      --single        Create as a singleton (non-repeatable) type
      --types string  Generate types to file (default: "prismicio-types.d.ts")
      --no-types      Skip type generation
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic page-type <command> --help\` for more information about a command.
`.trim();

export async function pageTypeCreate(): Promise<void> {
	const {
		values: { help, name, single, repo: repoFlag, types, "no-types": noTypes },
		positionals: [id],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "create"
		options: {
			repo: { type: "string", short: "r" },
			name: { type: "string", short: "n" },
			single: { type: "boolean" },
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

	const model = {
		id,
		label: name ?? pascalCase(id),
		repeatable: !single,
		status: true,
		format: "page",
		json: {
			Main: {},
			"SEO & Metadata": {},
		},
	} satisfies CustomType;

	const result = await insertCustomType(repo, model);
	if (!result.ok) {
		console.error(`Failed to create page type: ${result.error}`);
		process.exitCode = 1;
		return;
	}

	console.info(`Created page type "${id}" in repository "${repo}"`);

	if (!noTypes) {
		await generateTypesFile(repo, types || undefined);
	}
}

export function pascalCase(input: string): string {
	return input.toLowerCase().replace(/(^|[-_\s]+)(.)?/g, (_, __, c) => c?.toUpperCase() ?? "");
}
