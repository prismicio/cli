import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import {
	getCustomTypes,
	getSlices,
	insertCustomType,
	insertSlice,
	removeCustomType,
	removeSlice,
	updateCustomType,
	updateSlice,
} from "../clients/custom-types";
import { createCommand, type CommandConfig } from "../lib/command";
import { diffArrays } from "../lib/diff";
import { getDirtyTrackedPaths, getGitRoot } from "../lib/git";
import { isDescendant, relativePathname } from "../lib/url";
import { findProjectRoot, getRepositoryName } from "../project";

const config = {
	name: "prismic push",
	description: `
		Push local content types and slices to Prismic.

		Local models are the source of truth. Remote models are created,
		updated, or deleted to match.
	`,
	options: {
		force: { type: "boolean", short: "f", description: "Overwrite remote changes" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { force = false, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const adapter = await getAdapter();
	const projectRoot = await findProjectRoot();

	console.info(`Pushing to repository: ${repo}`);

	const [localCustomTypes, localSlices, remoteCustomTypes, remoteSlices, gitRoot] =
		await Promise.all([
			adapter.getCustomTypes(),
			adapter.getSlices(),
			getCustomTypes({ repo, token, host }),
			getSlices({ repo, token, host }),
			getGitRoot(projectRoot),
		]);
	const localCustomTypeModels = localCustomTypes.map((c) => c.model);
	const localSliceModels = localSlices.map((s) => s.model);

	const customTypeOps = diffArrays(localCustomTypeModels, remoteCustomTypes, {
		getKey: (m) => m.id,
	});
	const sliceOps = diffArrays(localSliceModels, remoteSlices, { getKey: (m) => m.id });

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
					"Local model files have uncommitted changes. Commit or stash before pushing, or re-run with --force:",
				);
				for (const path of dirtyModels) {
					console.error(relativePathname(projectRoot, path));
				}
				process.exitCode = 1;
				return;
			}
		}
	} else if (!force) {
		const destructive: string[] = [];
		for (const model of customTypeOps.update) {
			destructive.push(`customtypes/${model.id}/index.json (update)`);
		}
		for (const model of customTypeOps.delete) {
			destructive.push(`customtypes/${model.id}/index.json (delete)`);
		}
		for (const model of sliceOps.update) {
			destructive.push(`slices/${model.id} (update)`);
		}
		for (const model of sliceOps.delete) {
			destructive.push(`slices/${model.id} (delete)`);
		}
		if (destructive.length > 0) {
			console.error("Push would update or delete remote models. Re-run with --force to proceed.");
			for (const entry of destructive) console.error(entry);
			console.error("Track these files with git to enable a clean-state check instead.");
			process.exitCode = 1;
			return;
		}
	}

	for (const model of customTypeOps.insert) {
		await insertCustomType(model, { repo, token, host });
	}
	for (const model of customTypeOps.update) {
		await updateCustomType(model, { repo, token, host });
	}
	for (const id of customTypeOps.delete.map((m) => m.id)) {
		await removeCustomType(id, { repo, token, host });
	}
	for (const model of sliceOps.insert) {
		await insertSlice(model, { repo, token, host });
	}
	for (const model of sliceOps.update) {
		await updateSlice(model, { repo, token, host });
	}
	for (const id of sliceOps.delete.map((m) => m.id)) {
		await removeSlice(id, { repo, token, host });
	}

	const totalTypes = customTypeOps.insert.length + customTypeOps.update.length;
	const totalSlices = sliceOps.insert.length + sliceOps.update.length;
	const totalDeletes = customTypeOps.delete.length + sliceOps.delete.length;
	if (totalTypes === 0 && totalSlices === 0 && totalDeletes === 0) {
		console.info("Already up to date.");
	} else {
		console.info(`Pushed ${totalTypes} type(s), ${totalSlices} slice(s).`);
		if (totalDeletes > 0) console.info(`Deleted ${totalDeletes} model(s).`);
	}
});
