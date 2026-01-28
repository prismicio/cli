import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { findUpward } from "./lib/file";
import { type Framework, detectFrameworkInfo } from "./lib/framework";
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
      --types string   Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic page-type <command> --help\` for more information about a command.
`.trim();

function getDocsPath(framework: Framework): string {
	switch (framework) {
		case "next":
			return "nextjs/with-cli";
		case "nuxt":
			return "nuxt/with-cli";
		case "sveltekit":
			return "sveltekit/with-cli";
	}
}

function getWritePageComponentsAnchor(_framework: Framework): string {
	return "#write-page-components";
}

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

	try {
		await buildTypes({ output: types });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}

	console.info();
	console.info("Next: Add fields with `prismic page-type add-field`");

	const frameworkInfo = await detectFrameworkInfo();
	if (frameworkInfo?.framework) {
		const docsPath = getDocsPath(frameworkInfo.framework);
		const anchor = getWritePageComponentsAnchor(frameworkInfo.framework);
		console.info(
			`      Run \`prismic docs ${docsPath}${anchor}\` to learn how to implement a page file`,
		);
	}
}

export function pascalCase(input: string): string {
	return input.toLowerCase().replace(/(^|[-_\s]+)(.)?/g, (_, __, c) => c?.toUpperCase() ?? "");
}
