import { pascalCase } from "change-case";

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
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { diffArrays } from "../lib/diff";
import { getDirtyTrackedPaths, getGitRoot } from "../lib/git";
import { appendTrailingSlash, isDescendant, relativePathname } from "../lib/url";
import { findProjectRoot, getRepositoryName } from "../project";

const config = {
	name: "prismic push",
	description: `
		Push local content types and slices to Prismic.

		Local models are the source of truth. Remote models are created,
		updated, or deleted to match.
	`,
	options: {
		force: { type: "boolean", short: "f", description: "Skip safety checks" },
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

	const [gitRoot, customTypeLibraries, sliceLibraries] = await Promise.all([
		getGitRoot(projectRoot),
		adapter.getCustomTypeLibraries(),
		adapter.getSliceLibraries(),
	]);

	if (!force && gitRoot) {
		const dirtyTrackedPaths = await getDirtyTrackedPaths(gitRoot);
		const dirtyFiles = dirtyTrackedPaths
			.filter(
				(path) =>
					(path.pathname.endsWith("/model.json") &&
						sliceLibraries.some((lib) => isDescendant(lib, path))) ||
					(path.pathname.endsWith("/index.json") &&
						customTypeLibraries.some((lib) => isDescendant(lib, path))),
			)
			.map((path) => relativePathname(projectRoot, path));

		if (dirtyFiles.length > 0) {
			throw new CommandError(`
				Local model files have uncommitted changes. Choose one:

				  Discard local changes and adopt remote:
				    prismic pull --force

				  Keep local changes and overwrite remote:
				    prismic push --force

				  Combine both:
				    1. git stash
				    2. prismic pull
				    3. git stash pop
				    4. Resolve any JSON conflicts in your editor
				    5. prismic push

				Files with uncommitted changes:
				  ${dirtyFiles.join("\n")}
			`);
		}
	}

	const [localCustomTypes, localSlices, remoteCustomTypes, remoteSlices] = await Promise.all([
		adapter.getCustomTypes(),
		adapter.getSlices(),
		getCustomTypes({ repo, token, host }),
		getSlices({ repo, token, host }),
	]);
	const customTypeOps = diffArrays(
		localCustomTypes.map((customType) => customType.model),
		remoteCustomTypes,
		{ getKey: (model) => model.id },
	);
	const sliceOps = diffArrays(
		localSlices.map((slice) => slice.model),
		remoteSlices,
		{ getKey: (model) => model.id },
	);

	if (!force) {
		const customTypeLibrary = appendTrailingSlash(customTypeLibraries[0]);
		const sliceLibrary = appendTrailingSlash(sliceLibraries[0]);
		const deletedFiles = [
			...customTypeOps.delete.map((m) =>
				relativePathname(projectRoot, new URL(`${m.id}/index.json`, customTypeLibrary)),
			),
			...sliceOps.delete.map((m) =>
				relativePathname(projectRoot, new URL(`${pascalCase(m.name)}/model.json`, sliceLibrary)),
			),
		];
		if (deletedFiles.length > 0) {
			throw new CommandError(`
				Push would delete remote models. Re-run with --force to proceed.

				Models that would be deleted:
				  ${deletedFiles.join("\n")}
			`);
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
