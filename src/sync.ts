import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated, readHost, readToken } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { findUpward } from "./lib/file";
import { stringify } from "./lib/json";
import { getSlicesDirectory, pascalCase, SharedSliceSchema } from "./lib/slice";

const HELP = `
Sync custom types and slices from Prismic to local files.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic sync [flags]

FLAGS
  -r, --repo string   Repository domain
      --dry-run       Show what would be synced without writing files
      --types-only    Only sync custom types
      --slices-only   Only sync slices
      --json          Output as JSON
  -h, --help          Show help for command

EXAMPLES
  prismic sync
  prismic sync --repo my-repo
  prismic sync --dry-run
  prismic sync --types-only
`.trim();

const CustomTypeSchema = v.object({
	id: v.string(),
	label: v.optional(v.string()),
	repeatable: v.boolean(),
	status: v.boolean(),
	format: v.optional(v.string()),
	json: v.record(v.string(), v.unknown()),
});

export async function sync(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig(), "dry-run": dryRun, "types-only": typesOnly, "slices-only": slicesOnly, json },
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "sync"
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
		console.info(`Syncing from repository: ${repo}\n`);
	}

	// Fetch remote data in parallel
	const shouldFetchTypes = !slicesOnly;
	const shouldFetchSlices = !typesOnly;

	const [customTypesResult, slicesResult] = await Promise.all([
		shouldFetchTypes ? fetchRemoteCustomTypes(repo) : Promise.resolve({ ok: true, value: [] } as const),
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

	// Dry run - just show what would be synced
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
			console.info(`\nDry run complete: ${customTypes.length} custom types, ${slices.length} slices`);
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
				console.error(`Failed to write custom type ${ct.id}: ${error instanceof Error ? error.message : error}`);
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
				console.error(`Failed to write slice ${slice.name}: ${error instanceof Error ? error.message : error}`);
				process.exitCode = 1;
				return;
			}
		}
	}

	// Output summary
	if (json) {
		console.info(stringify({ writtenTypes, writtenSlices }));
	} else {
		console.info(`\nSync complete: ${writtenTypes.length} custom types, ${writtenSlices.length} slices`);
	}
}

async function getCustomTypesApiUrl(): Promise<URL> {
	const host = await readHost();
	host.hostname = `customtypes.${host.hostname}`;
	return host;
}

type FetchResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function fetchRemoteCustomTypes(repo: string): Promise<FetchResult<CustomType[]>> {
	const token = await readToken();
	if (!token) {
		return { ok: false, error: "Not authenticated" };
	}

	const baseUrl = await getCustomTypesApiUrl();
	const url = new URL("customtypes", baseUrl);

	try {
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				repository: repo,
			},
		});

		if (!response.ok) {
			if (response.status === 401) {
				return { ok: false, error: "Unauthorized. Your session may have expired. Run `prismic login` again." };
			}
			if (response.status === 403) {
				return { ok: false, error: `Access denied. You may not have access to repository "${repo}".` };
			}
			return { ok: false, error: `API error: ${response.status} ${response.statusText}` };
		}

		const data = await response.json();
		const result = v.safeParse(v.array(CustomTypeSchema), data);
		if (!result.success) {
			return { ok: false, error: "Invalid response from Custom Types API" };
		}

		return { ok: true, value: result.output as CustomType[] };
	} catch (error) {
		return { ok: false, error: `Network error: ${error instanceof Error ? error.message : error}` };
	}
}

async function fetchRemoteSlices(repo: string): Promise<FetchResult<SharedSlice[]>> {
	const token = await readToken();
	if (!token) {
		return { ok: false, error: "Not authenticated" };
	}

	const baseUrl = await getCustomTypesApiUrl();
	const url = new URL("slices", baseUrl);

	try {
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				repository: repo,
			},
		});

		if (!response.ok) {
			if (response.status === 401) {
				return { ok: false, error: "Unauthorized. Your session may have expired. Run `prismic login` again." };
			}
			if (response.status === 403) {
				return { ok: false, error: `Access denied. You may not have access to repository "${repo}".` };
			}
			return { ok: false, error: `API error: ${response.status} ${response.statusText}` };
		}

		const data = await response.json();
		const result = v.safeParse(v.array(SharedSliceSchema), data);
		if (!result.success) {
			return { ok: false, error: "Invalid response from Custom Types API" };
		}

		return { ok: true, value: result.output as SharedSlice[] };
	} catch (error) {
		return { ok: false, error: `Network error: ${error instanceof Error ? error.message : error}` };
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
