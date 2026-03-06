import type { CustomTypeModel } from "@prismicio/client";

import { parseArgs } from "node:util";
import { pascalCase } from "change-case";

import { buildTypes } from "./codegen-types";
import { requireFramework } from "./lib/framework-adapter";

const HELP = `
Create a new custom type in a Prismic repository.

USAGE
  prismic custom-type create <id> [flags]

ARGUMENTS
  id       Custom type identifier (required)

FLAGS
  -n, --name string   Display name for the custom type
      --single        Create as a singleton (non-repeatable) type
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic custom-type <command> --help\` for more information about a command.
`.trim();

export async function customTypeCreate(): Promise<void> {
	const {
		values: { help, name, single, types },
		positionals: [id],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "custom-type", "create"
		options: {
			name: { type: "string", short: "n" },
			single: { type: "boolean" },
			types: { type: "string" },
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

	const framework = await requireFramework();
	if (!framework) return;

	const model = {
		id,
		label: name ?? pascalCase(id),
		repeatable: !single,
		status: true,
		format: "custom",
		json: {
			Main: single
				? {}
				: {
						uid: {
							type: "UID",
							config: { label: "UID", placeholder: "" },
						},
					},
		},
	};

	try {
		await framework.createCustomType(model as unknown as CustomTypeModel);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to create custom type: ${error.message}`);
		} else {
			console.error(`Failed to create custom type`);
		}
		process.exitCode = 1;
		return;
	}

	console.info(`Created custom type "${id}"`);

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}

	console.info();
	console.info("Next: Add fields with `prismic custom-type add-field`");
}
