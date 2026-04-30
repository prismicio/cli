import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { createCommand, type CommandConfig } from "../lib/command";
import { diff3Arrays, diffArrays } from "../lib/diff";
import { relativePathname } from "../lib/url";
import { findProjectRoot, getRepositoryName, readSnapshot, writeSnapshot } from "../project";

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

export default createCommand(config, async ({ values }) => {
	const { force = false, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const adapter = await getAdapter();

	console.info(`Pulling from repository: ${repo}`);

	const [localCustomTypes, localSlices, remoteCustomTypes, remoteSlices, snapshot] =
		await Promise.all([
			adapter.getCustomTypes(),
			adapter.getSlices(),
			getCustomTypes({ repo, token, host }),
			getSlices({ repo, token, host }),
			readSnapshot(repo),
		]);

	const conflictPaths: URL[] = [];

	const customTypeOps = force
		? diffArrays(
				remoteCustomTypes,
				localCustomTypes.map((customType) => customType.model),
				{ getKey: (model) => model.id },
			)
		: diff3Arrays(
				snapshot?.customTypes,
				localCustomTypes.map((customType) => customType.model),
				remoteCustomTypes,
				{ getKey: (model) => model.id },
			);
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
		const conflictPath = await adapter.writeCustomTypeConflict(conflict.item, conflict.conflict);
		conflictPaths.push(conflictPath);
	}

	const sliceOps = force
		? diffArrays(
				remoteSlices,
				localSlices.map((slice) => slice.model),
				{ getKey: (model) => model.id },
			)
		: diff3Arrays(snapshot?.slices, localSlices.map((slice) => slice.model), remoteSlices, {
				getKey: (model) => model.id,
			});
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
		const conflictPath = await adapter.writeSliceConflict(conflict.item, conflict.conflict);
		conflictPaths.push(conflictPath);
	}

	if (conflictPaths.length === 0) {
		await adapter.generateTypes();
	}

	await writeSnapshot(repo, { customTypes: remoteCustomTypes, slices: remoteSlices });

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
		const projectRoot = await findProjectRoot();
		console.warn(
			`${totalConflicts} conflict${totalConflicts === 1 ? "" : "s"} — resolve before continuing:`,
		);
		for (const url of conflictPaths) {
			console.warn(relativePathname(projectRoot, url));
		}
	}
});
