import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { createCommand, type CommandConfig } from "../lib/command";
import { diffArrays } from "../lib/diff";
import { getRepositoryName, writeSnapshot } from "../project";

const config = {
	name: "prismic pull",
	description: `
		Pull content types and slices from Prismic to local files.

		Remote models are the source of truth. Local files are created, updated,
		or deleted to match.
	`,
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const adapter = await getAdapter();

	console.info(`Pulling from repository: ${repo}`);

	const [localCustomTypes, localSlices, remoteCustomTypes, remoteSlices] = await Promise.all([
		adapter.getCustomTypes(),
		adapter.getSlices(),
		getCustomTypes({ repo, token, host }),
		getSlices({ repo, token, host }),
	]);
	const localCustomTypeModels = localCustomTypes.map((c) => c.model);
	const localSliceModels = localSlices.map((s) => s.model);

	const customTypeOps = diffArrays(remoteCustomTypes, localCustomTypeModels, {
		key: (m) => m.id,
	});
	const sliceOps = diffArrays(remoteSlices, localSliceModels, { key: (m) => m.id });

	for (const model of customTypeOps.insert) {
		await adapter.createCustomType(model);
	}
	for (const model of customTypeOps.update) {
		await adapter.updateCustomType(model);
	}
	for (const id of customTypeOps.delete.map((m) => m.id)) {
		await adapter.deleteCustomType(id);
	}
	for (const model of sliceOps.insert) {
		await adapter.createSlice(model);
	}
	for (const model of sliceOps.update) {
		await adapter.updateSlice(model);
	}
	for (const id of sliceOps.delete.map((m) => m.id)) {
		await adapter.deleteSlice(id);
	}

	await adapter.generateTypes();

	await writeSnapshot(repo, { customTypes: remoteCustomTypes, slices: remoteSlices });

	const totalTypes = customTypeOps.insert.length + customTypeOps.update.length;
	const totalSlices = sliceOps.insert.length + sliceOps.update.length;
	const totalDeletes = customTypeOps.delete.length + sliceOps.delete.length;
	if (totalTypes === 0 && totalSlices === 0 && totalDeletes === 0) {
		console.info("Already up to date.");
	} else {
		console.info(`Pulled ${totalTypes} type(s), ${totalSlices} slice(s).`);
		if (totalDeletes > 0) console.info(`Deleted ${totalDeletes} model(s).`);
	}
});
