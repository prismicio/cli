import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import {
	deleteCustomType,
	deleteSlice,
	fetchRemoteCustomTypes,
	fetchRemoteSlices,
	insertCustomType,
	insertSlice,
	readLocalCustomTypes,
	readLocalSlices,
	updateCustomType,
	updateSlice,
} from "./lib/custom-types-api";
import { stringify } from "./lib/json";

const HELP = `
Push custom types and slices to Prismic from local files.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic push [flags]

FLAGS
  -r, --repo string   Repository domain
      --dry-run       Show what would be pushed without making changes
      --types-only    Only push custom types
      --slices-only   Only push slices
      --delete        Delete remote models that don't exist locally (dangerous)
      --json          Output as JSON
  -h, --help          Show help for command

EXAMPLES
  prismic push
  prismic push --repo my-repo
  prismic push --dry-run
  prismic push --types-only
  prismic push --delete
`.trim();

type DiffResult<T> = {
	toInsert: T[];
	toUpdate: T[];
	toDelete: string[];
};

function computeDiff<T extends { id: string }>(local: T[], remote: T[]): DiffResult<T> {
	const localById = new Map(local.map((item) => [item.id, item]));
	const remoteById = new Map(remote.map((item) => [item.id, item]));

	const toInsert: T[] = [];
	const toUpdate: T[] = [];
	const toDelete: string[] = [];

	// Find items to insert or update
	for (const localItem of local) {
		const remoteItem = remoteById.get(localItem.id);
		if (!remoteItem) {
			toInsert.push(localItem);
		} else if (JSON.stringify(localItem) !== JSON.stringify(remoteItem)) {
			toUpdate.push(localItem);
		}
	}

	// Find items to delete (remote IDs not in local)
	for (const remoteItem of remote) {
		if (!localById.has(remoteItem.id)) {
			toDelete.push(remoteItem.id);
		}
	}

	return { toInsert, toUpdate, toDelete };
}

export async function push(): Promise<void> {
	const {
		values: {
			help,
			repo = await safeGetRepositoryFromConfig(),
			"dry-run": dryRun,
			"types-only": typesOnly,
			"slices-only": slicesOnly,
			delete: deleteRemote,
			json,
		},
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "push"
		options: {
			repo: { type: "string", short: "r" },
			"dry-run": { type: "boolean" },
			"types-only": { type: "boolean" },
			"slices-only": { type: "boolean" },
			delete: { type: "boolean" },
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
		console.info(`Pushing to repository: ${repo}\n`);
	}

	const shouldPushTypes = !slicesOnly;
	const shouldPushSlices = !typesOnly;

	// Read local and fetch remote data in parallel
	const [localTypesResult, localSlicesResult, remoteTypesResult, remoteSlicesResult] =
		await Promise.all([
			shouldPushTypes ? readLocalCustomTypes() : Promise.resolve({ ok: true, value: [] } as const),
			shouldPushSlices ? readLocalSlices() : Promise.resolve({ ok: true, value: [] } as const),
			shouldPushTypes
				? fetchRemoteCustomTypes(repo)
				: Promise.resolve({ ok: true, value: [] } as const),
			shouldPushSlices
				? fetchRemoteSlices(repo)
				: Promise.resolve({ ok: true, value: [] } as const),
		]);

	if (!localTypesResult.ok) {
		console.error(`Failed to read local custom types: ${localTypesResult.error}`);
		process.exitCode = 1;
		return;
	}

	if (!localSlicesResult.ok) {
		console.error(`Failed to read local slices: ${localSlicesResult.error}`);
		process.exitCode = 1;
		return;
	}

	if (!remoteTypesResult.ok) {
		console.error(`Failed to fetch remote custom types: ${remoteTypesResult.error}`);
		process.exitCode = 1;
		return;
	}

	if (!remoteSlicesResult.ok) {
		console.error(`Failed to fetch remote slices: ${remoteSlicesResult.error}`);
		process.exitCode = 1;
		return;
	}

	const localTypes = localTypesResult.value;
	const localSlices = localSlicesResult.value;
	const remoteTypes = remoteTypesResult.value;
	const remoteSlices = remoteSlicesResult.value;

	if (!json) {
		if (shouldPushTypes) {
			console.info(`Local custom types: ${localTypes.length}`);
			console.info(`Remote custom types: ${remoteTypes.length}`);
		}
		if (shouldPushSlices) {
			console.info(`Local slices: ${localSlices.length}`);
			console.info(`Remote slices: ${remoteSlices.length}`);
		}
	}

	// Compute diffs
	const typesDiff = shouldPushTypes
		? computeDiff([...localTypes], [...remoteTypes])
		: { toInsert: [], toUpdate: [], toDelete: [] };
	const slicesDiff = shouldPushSlices
		? computeDiff([...localSlices], [...remoteSlices])
		: { toInsert: [], toUpdate: [], toDelete: [] };

	// If --delete is not specified, clear the toDelete arrays
	if (!deleteRemote) {
		typesDiff.toDelete = [];
		slicesDiff.toDelete = [];
	}

	const totalChanges =
		typesDiff.toInsert.length +
		typesDiff.toUpdate.length +
		typesDiff.toDelete.length +
		slicesDiff.toInsert.length +
		slicesDiff.toUpdate.length +
		slicesDiff.toDelete.length;

	if (totalChanges === 0) {
		if (json) {
			console.info(
				stringify({
					customTypes: { inserted: [], updated: [], deleted: [] },
					slices: { inserted: [], updated: [], deleted: [] },
				}),
			);
		} else {
			console.info("\nNo changes to push.");
		}
		return;
	}

	// Dry run - show what would happen
	if (dryRun) {
		if (json) {
			console.info(
				stringify({
					customTypes: {
						toInsert: typesDiff.toInsert.map((t) => t.id),
						toUpdate: typesDiff.toUpdate.map((t) => t.id),
						toDelete: typesDiff.toDelete,
					},
					slices: {
						toInsert: slicesDiff.toInsert.map((s) => s.id),
						toUpdate: slicesDiff.toUpdate.map((s) => s.id),
						toDelete: slicesDiff.toDelete,
					},
				}),
			);
		} else {
			console.info("");
			if (shouldPushTypes) {
				if (typesDiff.toInsert.length > 0) {
					console.info("Would insert custom types:");
					for (const ct of typesDiff.toInsert) {
						console.info(`  + ${ct.id}`);
					}
				}
				if (typesDiff.toUpdate.length > 0) {
					console.info("Would update custom types:");
					for (const ct of typesDiff.toUpdate) {
						console.info(`  ~ ${ct.id}`);
					}
				}
				if (typesDiff.toDelete.length > 0) {
					console.info("Would delete custom types:");
					for (const id of typesDiff.toDelete) {
						console.info(`  - ${id}`);
					}
				}
			}
			if (shouldPushSlices) {
				if (slicesDiff.toInsert.length > 0) {
					console.info("Would insert slices:");
					for (const slice of slicesDiff.toInsert) {
						console.info(`  + ${slice.id}`);
					}
				}
				if (slicesDiff.toUpdate.length > 0) {
					console.info("Would update slices:");
					for (const slice of slicesDiff.toUpdate) {
						console.info(`  ~ ${slice.id}`);
					}
				}
				if (slicesDiff.toDelete.length > 0) {
					console.info("Would delete slices:");
					for (const id of slicesDiff.toDelete) {
						console.info(`  - ${id}`);
					}
				}
			}
			console.info(`\nDry run complete: ${totalChanges} changes would be made`);
		}
		return;
	}

	// Execute changes
	const results = {
		customTypes: { inserted: [] as string[], updated: [] as string[], deleted: [] as string[] },
		slices: { inserted: [] as string[], updated: [] as string[], deleted: [] as string[] },
	};

	// Push custom types
	if (shouldPushTypes) {
		if (
			!json &&
			(typesDiff.toInsert.length > 0 ||
				typesDiff.toUpdate.length > 0 ||
				typesDiff.toDelete.length > 0)
		) {
			console.info("\nPushing custom types:");
		}

		for (const ct of typesDiff.toInsert) {
			const result = await insertCustomType(repo, ct as CustomType);
			if (!result.ok) {
				console.error(`Failed to insert custom type ${ct.id}: ${result.error}`);
				process.exitCode = 1;
				return;
			}
			results.customTypes.inserted.push(ct.id);
			if (!json) {
				console.info(`  + ${ct.id}`);
			}
		}

		for (const ct of typesDiff.toUpdate) {
			const result = await updateCustomType(repo, ct as CustomType);
			if (!result.ok) {
				console.error(`Failed to update custom type ${ct.id}: ${result.error}`);
				process.exitCode = 1;
				return;
			}
			results.customTypes.updated.push(ct.id);
			if (!json) {
				console.info(`  ~ ${ct.id}`);
			}
		}

		for (const id of typesDiff.toDelete) {
			const result = await deleteCustomType(repo, id);
			if (!result.ok) {
				console.error(`Failed to delete custom type ${id}: ${result.error}`);
				process.exitCode = 1;
				return;
			}
			results.customTypes.deleted.push(id);
			if (!json) {
				console.info(`  - ${id}`);
			}
		}
	}

	// Push slices
	if (shouldPushSlices) {
		if (
			!json &&
			(slicesDiff.toInsert.length > 0 ||
				slicesDiff.toUpdate.length > 0 ||
				slicesDiff.toDelete.length > 0)
		) {
			console.info("\nPushing slices:");
		}

		for (const slice of slicesDiff.toInsert) {
			const result = await insertSlice(repo, slice as SharedSlice);
			if (!result.ok) {
				console.error(`Failed to insert slice ${slice.id}: ${result.error}`);
				process.exitCode = 1;
				return;
			}
			results.slices.inserted.push(slice.id);
			if (!json) {
				console.info(`  + ${slice.id}`);
			}
		}

		for (const slice of slicesDiff.toUpdate) {
			const result = await updateSlice(repo, slice as SharedSlice);
			if (!result.ok) {
				console.error(`Failed to update slice ${slice.id}: ${result.error}`);
				process.exitCode = 1;
				return;
			}
			results.slices.updated.push(slice.id);
			if (!json) {
				console.info(`  ~ ${slice.id}`);
			}
		}

		for (const id of slicesDiff.toDelete) {
			const result = await deleteSlice(repo, id);
			if (!result.ok) {
				console.error(`Failed to delete slice ${id}: ${result.error}`);
				process.exitCode = 1;
				return;
			}
			results.slices.deleted.push(id);
			if (!json) {
				console.info(`  - ${id}`);
			}
		}
	}

	// Output summary
	if (json) {
		console.info(stringify(results));
	} else {
		const totalPushed =
			results.customTypes.inserted.length +
			results.customTypes.updated.length +
			results.customTypes.deleted.length +
			results.slices.inserted.length +
			results.slices.updated.length +
			results.slices.deleted.length;
		console.info(`\nPush complete: ${totalPushed} changes`);
	}
}
