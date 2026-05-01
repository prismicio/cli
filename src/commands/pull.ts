import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { readFile } from "node:fs/promises";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { createCommand, type CommandConfig } from "../lib/command";
import { diffArrays } from "../lib/diff";
import { writeFileRecursive } from "../lib/file";
import { getDirtyTrackedPaths, getGitRoot, mergeFile, readFileFromHead } from "../lib/git";
import { stringify } from "../lib/json";
import { isDescendant, relativePathname } from "../lib/url";
import { findProjectRoot, getRepositoryName } from "../project";

const config = {
	name: "prismic pull",
	description: `
		Pull content types and slices from Prismic to local files.

		Remote models are the source of truth. Local files are created, updated,
		or deleted to match.
	`,
	options: {
		force: { type: "boolean", short: "f", description: "Overwrite local changes" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

type ModelMeta<T> = { model: T; modelPath: URL };
type MergeOps<T> = {
	insert: T[];
	update: T[];
	delete: T[];
	conflicts: { path: URL; content: string }[];
};

export default createCommand(config, async ({ values }) => {
	const { force = false, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const adapter = await getAdapter();
	const projectRoot = await findProjectRoot();

	console.info(`Pulling from repository: ${repo}`);

	const [localCustomTypes, localSlices, remoteCustomTypes, remoteSlices, gitRoot] =
		await Promise.all([
			adapter.getCustomTypes(),
			adapter.getSlices(),
			getCustomTypes({ repo, token, host }),
			getSlices({ repo, token, host }),
			getGitRoot(projectRoot),
		]);

	const conflictPaths: URL[] = [];
	let customTypeOps: MergeOps<CustomType>;
	let sliceOps: MergeOps<SharedSlice>;

	if (gitRoot) {
		if (!force) {
			const sliceLibraries = await adapter.getSliceLibraries();
			const customTypeLibraries = await adapter.getCustomTypeLibraries();
			const dirtyTrackedPaths = await getDirtyTrackedPaths(gitRoot);
			const dirtyModels = dirtyTrackedPaths.filter(
				(path) =>
					(path.pathname.endsWith("/model.json") &&
						sliceLibraries.some((sliceLibrary) => isDescendant(sliceLibrary, path))) ||
					(path.pathname.endsWith("/index.json") &&
						customTypeLibraries.some((customTypeLibrary) => isDescendant(customTypeLibrary, path))),
			);

			if (dirtyModels.length > 0) {
				console.error(
					"Local model files have uncommitted changes. Commit or stash before pulling, or re-run with --force:",
				);
				for (const path of dirtyModels) {
					console.error(relativePathname(projectRoot, path));
				}
				process.exitCode = 1;
				return;
			}
		}

		customTypeOps = await mergeWithGit(localCustomTypes, remoteCustomTypes, gitRoot);
		sliceOps = await mergeWithGit(localSlices, remoteSlices, gitRoot);
	} else {
		const localCustomTypeModels = localCustomTypes.map((customType) => customType.model);
		const localSliceModels = localSlices.map((slice) => slice.model);
		const customTypeDiff = diffArrays(remoteCustomTypes, localCustomTypeModels, {
			getKey: (model) => model.id,
		});
		const sliceDiff = diffArrays(remoteSlices, localSliceModels, {
			getKey: (model) => model.id,
		});

		if (!force) {
			const destructive: string[] = [];
			for (const model of customTypeDiff.update) {
				destructive.push(`customtypes/${model.id}/index.json (update)`);
			}
			for (const model of customTypeDiff.delete) {
				destructive.push(`customtypes/${model.id}/index.json (delete)`);
			}
			for (const model of sliceDiff.update) {
				destructive.push(`slices/${model.id} (update)`);
			}
			for (const model of sliceDiff.delete) {
				destructive.push(`slices/${model.id} (delete)`);
			}
			if (destructive.length > 0) {
				console.error("Pull would modify or delete local files. Re-run with --force to proceed.");
				for (const entry of destructive) console.error(entry);
				console.error("Track these files with git to enable a 3-way merge instead of overwriting.");
				process.exitCode = 1;
				return;
			}
		}

		customTypeOps = { ...customTypeDiff, conflicts: [] };
		sliceOps = { ...sliceDiff, conflicts: [] };
	}

	for (const model of customTypeOps.insert) {
		await adapter.createCustomType(model);
	}
	for (const model of customTypeOps.update) {
		await adapter.updateCustomType(model);
	}
	for (const model of customTypeOps.delete) {
		await adapter.deleteCustomType(model.id);
	}
	for (const conflict of customTypeOps.conflicts) {
		await writeFileRecursive(conflict.path, conflict.content);
		conflictPaths.push(conflict.path);
	}

	for (const model of sliceOps.insert) {
		await adapter.createSlice(model);
	}
	for (const model of sliceOps.update) {
		await adapter.updateSlice(model);
	}
	for (const model of sliceOps.delete) {
		await adapter.deleteSlice(model.id);
	}
	for (const conflict of sliceOps.conflicts) {
		await writeFileRecursive(conflict.path, conflict.content);
		conflictPaths.push(conflict.path);
	}

	if (conflictPaths.length === 0) {
		await adapter.generateTypes();
	}

	const totalTypes = customTypeOps.insert.length + customTypeOps.update.length;
	const totalSlices = sliceOps.insert.length + sliceOps.update.length;
	const totalDeletes = customTypeOps.delete.length + sliceOps.delete.length;
	const totalConflicts = conflictPaths.length;

	if (totalTypes === 0 && totalSlices === 0 && totalDeletes === 0 && totalConflicts === 0) {
		console.info("Already up to date.");
		return;
	}

	console.info(
		`Inserted ${customTypeOps.insert.length}, updated ${customTypeOps.update.length}, deleted ${customTypeOps.delete.length} types`,
	);
	console.info(
		`Inserted ${sliceOps.insert.length}, updated ${sliceOps.update.length}, deleted ${sliceOps.delete.length} slices`,
	);

	if (totalConflicts > 0) {
		console.warn(
			`${totalConflicts} conflict${totalConflicts === 1 ? "" : "s"} — resolve before continuing:`,
		);
		for (const url of conflictPaths) {
			console.warn(relativePathname(projectRoot, url));
		}
	}
});

async function mergeWithGit<T extends { id: string }>(
	locals: ModelMeta<T>[],
	remotes: T[],
	gitRoot: URL,
): Promise<MergeOps<T>> {
	const localById = new Map(locals.map((local) => [local.model.id, local]));
	const remoteById = new Map(remotes.map((remote) => [remote.id, remote]));
	const ids = new Set([...localById.keys(), ...remoteById.keys()]);

	const ops: MergeOps<T> = { insert: [], update: [], delete: [], conflicts: [] };

	for (const id of ids) {
		const local = localById.get(id);
		const remote = remoteById.get(id);

		if (!local && remote) {
			ops.insert.push(remote);
			continue;
		}

		if (local && !remote) {
			const baseText = await readFileFromHead(local.modelPath, gitRoot);
			if (baseText !== undefined) ops.delete.push(local.model);
			// Untracked local-only file: leave it alone.
			continue;
		}

		if (local && remote) {
			const remoteText = stringify(remote);
			const localText = await readFile(local.modelPath, "utf8");
			if (localText === remoteText) continue;
			const baseText = (await readFileFromHead(local.modelPath, gitRoot)) ?? "";
			const merge = await mergeFile(localText, baseText, remoteText);
			if (merge.conflict) {
				ops.conflicts.push({ path: local.modelPath, content: merge.result });
			} else {
				try {
					ops.update.push(JSON.parse(merge.result) as T);
				} catch {
					ops.conflicts.push({ path: local.modelPath, content: merge.result });
				}
			}
		}
	}

	return ops;
}
