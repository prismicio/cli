import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { generateTypes, NON_EDITABLE_FILE_HEADER } from "prismic-ts-codegen";

import type { FrameworkAdapter } from "./lib/framework-adapter";

import { requireFramework } from "./lib/framework-adapter";

const HELP = `
Generate TypeScript types from local custom type and slice models.

USAGE
  prismic codegen types [flags]

FLAGS
  -o, --output string   Output file path (default: "prismicio-types.d.ts")
  -h, --help            Show help for command

EXAMPLES
  prismic codegen types
  prismic codegen types --output custom.d.ts
`.trim();

export async function codegenTypes(): Promise<void> {
	const {
		values: { help, output },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "codegen", "types"
		options: {
			output: { type: "string", short: "o" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: false,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	try {
		await buildTypes({ output });
		console.info(`Generated types written to ${output ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

export async function buildTypes(args?: {
	output?: string;
	framework?: FrameworkAdapter;
}): Promise<void> {
	const output = args?.output ?? "prismicio-types.d.ts";

	const framework = args?.framework ?? (await requireFramework());
	if (!framework) {
		throw new Error("No supported framework found");
	}

	const [customTypeResults, sliceResults] = await Promise.all([
		framework.getCustomTypes(),
		framework.getSlices(),
	]);

	const customTypes = customTypeResults.map((ct) => ct.model);
	const slices = sliceResults.map((s) => s.model);

	const types = generateTypes({
		customTypeModels: customTypes,
		sharedSliceModels: slices,
		typesProvider: "@prismicio/client",
		clientIntegration: {
			includeCreateClientInterface: customTypes.length > 0 || slices.length > 0,
			includeContentNamespace: true,
		},
	});

	const content = NON_EDITABLE_FILE_HEADER + "\n\n" + types;

	await writeFile(output, content);
}
