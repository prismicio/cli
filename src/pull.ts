import { pascalCase } from "change-case";
import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemoteCustomTypes, fetchRemoteSlices } from "./lib/custom-types-api";
import { requireFramework } from "./lib/framework-adapter";
import { stringify } from "./lib/json";

const HELP = `
Pull custom types and slices from Prismic to local files.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic pull [flags]

FLAGS
  -r, --repo string   Repository domain
      --dry-run       Show what would be pulled without writing files
      --types-only    Only pull custom types
      --slices-only   Only pull slices
      --json          Output as JSON
      --types string  Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help          Show help for command

EXAMPLES
  prismic pull
  prismic pull --repo my-repo
  prismic pull --dry-run
  prismic pull --types-only
`.trim();

export async function pull(): Promise<void> {
	const {
		values: {
			help,
			repo = await safeGetRepositoryFromConfig(),
			"dry-run": dryRun,
			"types-only": typesOnly,
			"slices-only": slicesOnly,
			json,
			types,
		},
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "pull"
		options: {
			repo: { type: "string", short: "r" },
			"dry-run": { type: "boolean" },
			"types-only": { type: "boolean" },
			"slices-only": { type: "boolean" },
			json: { type: "boolean" },
			types: { type: "string" },
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

	// Check authentication
	if (!(await isAuthenticated())) {
		console.error("Not logged in. Run `prismic login` first.");
		process.exitCode = 1;
		return;
	}

	if (!json) {
		console.info(`Pulling from repository: ${repo}\n`);
	}

	// Fetch remote data in parallel
	const shouldFetchTypes = !slicesOnly;
	const shouldFetchSlices = !typesOnly;

	const [customTypesResult, slicesResult] = await Promise.all([
		shouldFetchTypes
			? fetchRemoteCustomTypes(repo)
			: Promise.resolve({ ok: true, value: [] } as const),
		shouldFetchSlices ? fetchRemoteSlices(repo) : Promise.resolve({ ok: true, value: [] } as const),
	]);

	if (!customTypesResult.ok) {
		console.error(`Failed to fetch custom types: ${customTypesResult.error}`);
		process.exitCode = 1;
		return;
	}

	if (!slicesResult.ok) {
		console.error(`Failed to fetch slices: ${slicesResult.error}`);
		process.exitCode = 1;
		return;
	}

	const customTypes = customTypesResult.value;
	const slices = slicesResult.value;

	if (!json) {
		if (shouldFetchTypes) {
			console.info(`Fetching custom types... ${customTypes.length} types`);
		}
		if (shouldFetchSlices) {
			console.info(`Fetching slices... ${slices.length} slices`);
		}
	}

	// Get framework adapter
	const framework = await requireFramework();
	if (!framework) return;

	// Dry run - just show what would be pulled
	if (dryRun) {
		if (json) {
			console.info(stringify({ customTypes, slices }));
		} else {
			console.info("");
			if (shouldFetchTypes && customTypes.length > 0) {
				console.info("Would write custom types:");
				for (const ct of customTypes) {
					console.info(`  customtypes/${ct.id}/index.json`);
				}
			}
			if (shouldFetchSlices && slices.length > 0) {
				const slicesDir = await framework.getDefaultSliceLibrary();
				const relativeSlicesDir = getRelativePath(slicesDir);
				console.info("Would write slices:");
				for (const slice of slices) {
					console.info(`  ${relativeSlicesDir}${pascalCase(slice.name)}/model.json`);
				}
			}
			console.info(
				`\nDry run complete: ${customTypes.length} custom types, ${slices.length} slices`,
			);
		}
		return;
	}

	// Get existing local slices to determine create vs update
	const existingSlices = await framework.getSlices();
	const existingSliceIds = new Set(existingSlices.map((s) => s.model.id));
	const defaultLibrary = await framework.getDefaultSliceLibrary();

	const writtenTypes: string[] = [];
	const writtenSlices: string[] = [];

	// Write custom types
	if (shouldFetchTypes && customTypes.length > 0) {
		if (!json) {
			console.info("\nWriting custom types:");
		}

		for (const ct of customTypes) {
			try {
				await framework.updateCustomType(ct);
				const relativePath = `customtypes/${ct.id}/index.json`;
				writtenTypes.push(relativePath);
				if (!json) {
					console.info(`  ${relativePath}`);
				}
			} catch (error) {
				console.error(
					`Failed to write custom type ${ct.id}: ${error instanceof Error ? error.message : error}`,
				);
				process.exitCode = 1;
				return;
			}
		}
	}

	// Write slices
	if (shouldFetchSlices && slices.length > 0) {
		if (!json) {
			console.info("\nWriting slices:");
		}
		const slicesDir = await framework.getDefaultSliceLibrary();

		for (const slice of slices) {
			try {
				if (existingSliceIds.has(slice.id)) {
					await framework.updateSlice(slice);
				} else {
					await framework.createSlice(slice, defaultLibrary);
				}
				const relativePath = `${getRelativePath(slicesDir)}${pascalCase(slice.name)}/model.json`;
				writtenSlices.push(relativePath);
				if (!json) {
					console.info(`  ${relativePath}`);
				}
			} catch (error) {
				console.error(
					`Failed to write slice ${slice.name}: ${error instanceof Error ? error.message : error}`,
				);
				process.exitCode = 1;
				return;
			}
		}
	}

	// Output summary
	if (json) {
		console.info(stringify({ writtenTypes, writtenSlices }));
	} else {
		console.info(
			`\nPull complete: ${writtenTypes.length} custom types, ${writtenSlices.length} slices`,
		);
	}

	if (!json) {
		try {
			await buildTypes({ output: types, framework });
			console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
		} catch (error) {
			console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
		}
	}
}

function getRelativePath(url: URL): string {
	const cwd = process.cwd();
	const path = url.pathname;
	if (path.startsWith(cwd)) {
		return path.slice(cwd.length + 1);
	}
	return path;
}
