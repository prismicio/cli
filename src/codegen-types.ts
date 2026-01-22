import type { CustomTypeModel, SharedSliceModel } from "@prismicio/client";

import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { generateTypes, NON_EDITABLE_FILE_HEADER } from "prismic-ts-codegen";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemoteCustomTypes, fetchRemoteSlices } from "./lib/custom-types-api";
import { getLocales } from "./locale-list";

const HELP = `
Generate TypeScript types from models pushed to Prismic.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic codegen types [flags]

FLAGS
  -o, --output string   Output file path (default: "prismicio-types.d.ts")
  -r, --repo string     Repository domain
  -h, --help            Show help for command

EXAMPLES
  prismic codegen types
  prismic codegen types --repo my-repo
  prismic codegen types --output custom.d.ts
`.trim();

export async function generateTypesFile(repo: string, output = "prismicio-types.d.ts"): Promise<void> {
	try {
		const [customTypesResult, slicesResult, localesResult] = await Promise.all([
			fetchRemoteCustomTypes(repo),
			fetchRemoteSlices(repo),
			getLocales(repo),
		]);

		if (!customTypesResult.ok) {
			console.warn(`Warning: Could not generate types: ${customTypesResult.error}`);
			return;
		}
		if (!slicesResult.ok) {
			console.warn(`Warning: Could not generate types: ${slicesResult.error}`);
			return;
		}
		if (!localesResult.ok) {
			console.warn(`Warning: Could not generate types: ${localesResult.error}`);
			return;
		}

		const customTypes = customTypesResult.value as unknown as CustomTypeModel[];
		const slices = slicesResult.value as unknown as SharedSliceModel[];
		const localeIDs = localesResult.value.results.map((l) => l.id);

		const types = generateTypes({
			customTypeModels: customTypes,
			sharedSliceModels: slices,
			localeIDs,
			typesProvider: "@prismicio/client",
			clientIntegration: {
				includeCreateClientInterface: customTypes.length > 0 || slices.length > 0,
				includeContentNamespace: true,
			},
		});

		const content = NON_EDITABLE_FILE_HEADER + "\n\n" + types;
		await writeFile(output, content);
		console.info(`Generated types written to ${output}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`Warning: Type generation failed: ${message}`);
	}
}

export async function codegenTypes(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig(), output = "prismicio-types.d.ts" },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "codegen", "types"
		options: {
			output: { type: "string", short: "o" },
			repo: { type: "string", short: "r" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: false,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!repo) {
		console.error("Missing prismic.config.json or --repo option");
		process.exitCode = 1;
		return;
	}

	if (!(await isAuthenticated())) {
		console.error("Not logged in. Run `prismic login` first.");
		process.exitCode = 1;
		return;
	}

	await generateTypesFile(repo, output);
}
