import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { findUpward } from "./lib/file";
import { stringify } from "./lib/json";

const HELP = `
Create a new page type in a Prismic repository.

USAGE
  prismic page-type create <id> [flags]

ARGUMENTS
  id       Page type identifier (required)

FLAGS
  -n, --name string   Display name for the page type
      --single        Create as a singleton (non-repeatable) type
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic page-type <command> --help\` for more information about a command.
`.trim();

export async function pageTypeCreate(): Promise<void> {
	const {
		values: { help, name, single },
		positionals: [id],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "create"
		options: {
			name: { type: "string", short: "n" },
			single: { type: "boolean" },
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

	const projectRoot = await findUpward("package.json");
	if (!projectRoot) {
		console.error("Could not find project root (no package.json found)");
		process.exitCode = 1;
		return;
	}

	const customTypesDirectory = new URL("customtypes/", projectRoot);
	const typeDirectory = new URL(id + "/", customTypesDirectory);
	const modelPath = new URL("index.json", typeDirectory);

	try {
		await mkdir(new URL(".", modelPath), { recursive: true });
		await writeFile(modelPath, stringify(model));
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to create page type: ${error.message}`);
		} else {
			console.error(`Failed to create page type`);
		}
		process.exitCode = 1;
		return;
	}

	console.info(`Created page type at ${modelPath.href}`);
}

export function pascalCase(input: string): string {
	return input.toLowerCase().replace(/(^|[-_\s]+)(.)?/g, (_, __, c) => c?.toUpperCase() ?? "");
}
