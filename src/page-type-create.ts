import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { pascalCase } from "change-case";
import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { getDocsPath, requireFramework } from "./lib/framework-adapter";

const HELP = `
Create a new page type in a Prismic repository.

USAGE
  prismic page-type create <id> [flags]

ARGUMENTS
  id       Page type identifier (required)

FLAGS
  -n, --name string   Display name for the page type
      --single        Create as a singleton (non-repeatable) type
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic page-type <command> --help\` for more information about a command.
`.trim();

export async function pageTypeCreate(): Promise<void> {
	const {
		values: { help, name, single, types },
		positionals: [id],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "create"
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
		format: "page",
		json: {
			Main: single
				? {}
				: {
						uid: {
							type: "UID",
							config: { label: "UID", placeholder: "" },
						},
					},
			"SEO & Metadata": {
				meta_title: {
					type: "Text",
					config: {
						label: "Meta Title",
						placeholder: "A title of the page used for social media and search engines",
					},
				},
				meta_description: {
					type: "Text",
					config: {
						label: "Meta Description",
						placeholder: "A brief summary of the page",
					},
				},
				meta_image: {
					type: "Image",
					config: {
						label: "Meta Image",
						constraint: { width: 2400, height: 1260 },
						thumbnails: [],
					},
				},
			},
		},
	};

	try {
		const { modelPath } = await framework.createCustomType(model as CustomType);
		console.info(`Created page type at ${modelPath.href}`);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to create page type: ${error.message}`);
		} else {
			console.error(`Failed to create page type`);
		}
		process.exitCode = 1;
		return;
	}

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}

	console.info();
	console.info("Next: Add fields with `prismic page-type add-field`");

	if (framework) {
		const docsPath = getDocsPath(framework.id);
		console.info(
			`      Run \`prismic docs fetch ${docsPath}#write-page-components\` to learn how to implement a page file`,
		);
	}
}
