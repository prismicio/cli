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
import { getRepositoryName, readSnapshot, writeSnapshot } from "../project";

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

	console.info(`Pushing to repository: ${repo}`);

	const [localCustomTypes, localSlices, remoteCustomTypes, remoteSlices] = await Promise.all([
		adapter.getCustomTypes(),
		adapter.getSlices(),
		getCustomTypes({ repo, token, host }),
		getSlices({ repo, token, host }),
	]);
	const localCustomTypeModels = localCustomTypes.map((c) => c.model);
	const localSliceModels = localSlices.map((s) => s.model);

	const snapshot = await readSnapshot(repo);
	if (!snapshot) {
		// First push from this machine — establish a baseline so subsequent commands
		// have one. No drift comparison: snapshot would trivially equal remote.
		await writeSnapshot(repo, { customTypes: remoteCustomTypes, slices: remoteSlices });
	} else if (!force) {
		const customTypesDrifted =
			JSON.stringify(sortById(snapshot.customTypes)) !==
			JSON.stringify(sortById(remoteCustomTypes));
		const slicesDrifted =
			JSON.stringify(sortById(snapshot.slices)) !== JSON.stringify(sortById(remoteSlices));
		const isDrifted = customTypesDrifted || slicesDrifted;
		if (isDrifted) {
			throw new CommandError(`
				Remote has changed since you last pulled.

				To overwrite remote with your local changes:
				  prismic push --force

				To discard local changes and adopt remote:
				  prismic pull --force

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

	const customTypeOps = diffArrays(localCustomTypeModels, remoteCustomTypes, {
		key: (m) => m.id,
	});
	const sliceOps = diffArrays(localSliceModels, remoteSlices, { key: (m) => m.id });

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

	const [newRemoteCustomTypes, newRemoteSlices] = await Promise.all([
		getCustomTypes({ repo, token, host }),
		getSlices({ repo, token, host }),
	]);
	await writeSnapshot(repo, { customTypes: newRemoteCustomTypes, slices: newRemoteSlices });

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

function sortById<T extends { id: string }>(items: T[]): T[] {
	return [...items].sort((a, b) => a.id.localeCompare(b.id));
}
