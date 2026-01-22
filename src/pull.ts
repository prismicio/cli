import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemoteCustomTypes, fetchRemoteSlices } from "./lib/custom-types-api";
import { findUpward } from "./lib/file";
import { stringify } from "./lib/json";
import { getSlicesDirectory, pascalCase } from "./lib/slice";

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
		},
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "pull"
		options: {
			repo: { type: "string", short: "r" },
			"dry-run": { type: "boolean" },
			"types-only": { type: "boolean" },
			"slices-only": { type: "boolean" },
			json: { type: "boolean" },
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
				const slicesDir = await getSlicesDirectory();
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

	// Find project root
	const projectRoot = await findUpward("package.json");
	if (!projectRoot) {
		console.error("Could not find project root (no package.json found)");
		process.exitCode = 1;
		return;
	}
	const projectDir = new URL(".", projectRoot);

	const writtenTypes: string[] = [];
	const writtenSlices: string[] = [];

	// Write custom types
	if (shouldFetchTypes && customTypes.length > 0) {
		if (!json) {
			console.info("\nWriting custom types:");
		}
		const customTypesDir = new URL("customtypes/", projectDir);

		for (const ct of customTypes) {
			const typeDir = new URL(`${ct.id}/`, customTypesDir);
			const modelPath = new URL("index.json", typeDir);

			try {
				await mkdir(typeDir, { recursive: true });
				await writeFile(modelPath, stringify(ct));
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
		const slicesDir = await getSlicesDirectory();

		for (const slice of slices) {
			const sliceDir = new URL(`${pascalCase(slice.name)}/`, slicesDir);
			const modelPath = new URL("model.json", sliceDir);

			try {
				await mkdir(sliceDir, { recursive: true });
				await writeFile(modelPath, stringify(slice));
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
}

function getRelativePath(url: URL): string {
	const cwd = process.cwd();
	const path = url.pathname;
	if (path.startsWith(cwd)) {
		return path.slice(cwd.length + 1);
	}
	return path;
}
