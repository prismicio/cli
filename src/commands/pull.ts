import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { diffArrays } from "../lib/diff";
import { getRepositoryName, readSnapshot, writeSnapshot } from "../project";

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

	const [localCustomTypes, localSlices, remoteCustomTypes, remoteSlices] = await Promise.all([
		adapter.getCustomTypes(),
		adapter.getSlices(),
		getCustomTypes({ repo, token, host }),
		getSlices({ repo, token, host }),
	]);
	const localCustomTypeModels = localCustomTypes.map((c) => c.model);
	const localSliceModels = localSlices.map((s) => s.model);

	if (!force) {
		const snapshot = await readSnapshot(repo);
		const customTypesDriftFromRemote = diffArrays(localCustomTypeModels, remoteCustomTypes, {
			key: (m) => m.id,
		});
		const slicesDriftFromRemote = diffArrays(localSliceModels, remoteSlices, {
			key: (m) => m.id,
		});
		const customTypesDrifted = snapshot
			? JSON.stringify(sortById(localCustomTypeModels)) !==
				JSON.stringify(sortById(snapshot.customTypes))
			: customTypesDriftFromRemote.insert.length + customTypesDriftFromRemote.update.length > 0;
		const slicesDrifted = snapshot
			? JSON.stringify(sortById(localSliceModels)) !== JSON.stringify(sortById(snapshot.slices))
			: slicesDriftFromRemote.insert.length + slicesDriftFromRemote.update.length > 0;
		const isDrifted = customTypesDrifted || slicesDrifted;
		if (isDrifted) {
			throw new CommandError(`
				You have local changes that haven't been pushed. Pulling would overwrite them.

				To discard local changes and adopt remote:
				  prismic pull --force

				To overwrite remote with your local changes:
				  prismic push --force

				To merge both, use git:
				  1. Stash your local edits: \`git stash\`
				  2. Run \`prismic pull --force\` to update local from remote.
				  3. Reapply your edits: \`git stash pop\`
				  4. Resolve any JSON conflicts in your editor.
				  5. Run \`prismic push\`.

				If your edits are already committed, run \`git reset --soft HEAD~1\`
				first to move them back to the working tree.
			`);
		}
	}

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

function sortById<T extends { id: string }>(items: T[]): T[] {
	return [...items].sort((a, b) => a.id.localeCompare(b.id));
}
