import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { getRepositoryName, readSnapshot, writeSnapshot } from "../project";

const config = {
	name: "prismic pull",
	description: `
		Pull content types and slices from Prismic to local files.

		Remote models are the source of truth. Local files are created, updated,
		or deleted to match.
	`,
	options: {
		force: { type: "boolean", short: "f", description: "Ignore local drift" },
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
		const customTypesDrifted = snapshot
			? JSON.stringify(sortById(localCustomTypeModels)) !==
				JSON.stringify(sortById(snapshot.customTypes))
			: hasUnpushedChanges(localCustomTypeModels, remoteCustomTypes);
		const slicesDrifted = snapshot
			? JSON.stringify(sortById(localSliceModels)) !== JSON.stringify(sortById(snapshot.slices))
			: hasUnpushedChanges(localSliceModels, remoteSlices);
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

	const customTypeOps = diffOps(localCustomTypeModels, remoteCustomTypes);
	const sliceOps = diffOps(localSliceModels, remoteSlices);

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

type Ops<T> = { insert: T[]; update: T[]; delete: T[] };

function sortById<T extends { id: string }>(items: T[]): T[] {
	return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

function hasUnpushedChanges<T extends { id: string }>(local: T[], remote: T[]): boolean {
	return local.some((m) => {
		const r = remote.find((x) => x.id === m.id);
		return !r || JSON.stringify(m) !== JSON.stringify(r);
	});
}

function diffOps<T extends CustomType | SharedSlice>(local: T[], remote: T[]): Ops<T> {
	const ops: Ops<T> = { insert: [], update: [], delete: [] };
	for (const remoteModel of remote) {
		const localModel = local.find((l) => l.id === remoteModel.id);
		if (!localModel) {
			ops.insert.push(remoteModel);
		} else if (JSON.stringify(remoteModel) !== JSON.stringify(localModel)) {
			ops.update.push(remoteModel);
		}
	}
	for (const localModel of local) {
		if (!remote.some((r) => r.id === localModel.id)) {
			ops.delete.push(localModel);
		}
	}
	return ops;
}
