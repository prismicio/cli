import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { resolveEnvironment } from "../environments";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { diffArrays } from "../lib/diff";
import { getDirtyPaths, getGitRoot } from "../lib/git";
import { isDescendant, relativePathname } from "../lib/url";
import { canonicalizeModel } from "../models";
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
		env: { type: "string", short: "e", description: "Environment domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { force = false, repo: parentRepo = await getRepositoryName(), env } = values;

	const token = await getToken();
	const host = await getHost();
	const adapter = await getAdapter();
	const projectRoot = await findProjectRoot();

	const repo = env ? await resolveEnvironment(env, { repo: parentRepo, token, host }) : parentRepo;

	console.info(`Pulling from repository: ${parentRepo}${env ? ` (env: ${env})` : ""}`);

	const [gitRoot, customTypeLibraries, sliceLibraries] = await Promise.all([
		getGitRoot(projectRoot),
		adapter.getCustomTypeLibraries(),
		adapter.getSliceLibraries(),
	]);

	if (!force && gitRoot) {
		const dirtyPaths = await getDirtyPaths(gitRoot);
		const dirtyFiles = dirtyPaths
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
				Local model files have uncommitted changes. Commit them first so a
				pull won't silently discard your edits:

				  git add ${dirtyFiles.join(" ")}
				  git commit -m "Update Prismic models"
				  prismic pull

				Other options:
				  prismic push --force   Keep local edits, overwrite remote
				  prismic pull --force   Discard local edits, adopt remote
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
		remoteCustomTypes,
		localCustomTypes.map((customType) => customType.model),
		{
			getKey: (model) => model.id,
			equals: (a, b) =>
				JSON.stringify(canonicalizeModel(a)) === JSON.stringify(canonicalizeModel(b)),
		},
	);
	const sliceOps = diffArrays(
		remoteSlices,
		localSlices.map((slice) => slice.model),
		{
			getKey: (model) => model.id,
			equals: (a, b) =>
				JSON.stringify(canonicalizeModel(a)) === JSON.stringify(canonicalizeModel(b)),
		},
	);

	if (!force && !gitRoot) {
		const customTypeIds = new Set(
			[...customTypeOps.update, ...customTypeOps.delete].map((op) => op.id),
		);
		const sliceIds = new Set([...sliceOps.update, ...sliceOps.delete].map((op) => op.id));
		const affectedFiles = [
			...localCustomTypes.filter((c) => customTypeIds.has(c.model.id)),
			...localSlices.filter((s) => sliceIds.has(s.model.id)),
		].map((meta) => relativePathname(projectRoot, meta.modelPath));

		if (affectedFiles.length > 0) {
			throw new CommandError(`
				Pull would modify or delete local model files:
				  ${affectedFiles.join("\n")}

				This project isn't in a git repo, so changes can't be tracked. Choose one:
				  prismic pull --force   Discard local files, adopt remote
				  prismic push --force   Keep local files, overwrite remote
			`);
		}
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
	for (const model of sliceOps.insert) {
		await adapter.createSlice(model);
	}
	for (const model of sliceOps.update) {
		await adapter.updateSlice(model);
	}
	for (const model of sliceOps.delete) {
		await adapter.deleteSlice(model.id);
	}

	await adapter.generateTypes();

	const totalTypes = customTypeOps.insert.length + customTypeOps.update.length;
	const totalSlices = sliceOps.insert.length + sliceOps.update.length;
	const totalDeletes = customTypeOps.delete.length + sliceOps.delete.length;

	if (totalTypes === 0 && totalSlices === 0 && totalDeletes === 0) {
		console.info("Already up to date.");
		return;
	}

	console.info(
		`Inserted ${customTypeOps.insert.length}, updated ${customTypeOps.update.length}, deleted ${customTypeOps.delete.length} types`,
	);
	console.info(
		`Inserted ${sliceOps.insert.length}, updated ${sliceOps.update.length}, deleted ${sliceOps.delete.length} slices`,
	);
});
