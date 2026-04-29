import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

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
import { dedent, formatTable } from "../lib/string";
import { getRepositoryName, readSnapshot, writeSnapshot } from "../project";

const config = {
	name: "prismic push",
	description: dedent`
		Push local content types and slices to Prismic.

		Local models are the source of truth. Remote models are created,
		updated, or deleted to match. Destructive changes (overwrite or
		delete) require --force.
	`,
	options: {
		force: { type: "boolean", short: "f", description: "Allow destructive changes" },
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
	if (snapshot && !force) {
		const isDrifted =
			JSON.stringify(snapshot.customTypes) !== JSON.stringify(remoteCustomTypes) ||
			JSON.stringify(snapshot.slices) !== JSON.stringify(remoteSlices);
		if (isDrifted) {
			throw new CommandError(dedent`
				Remote has changed since the last sync. Resolve via Git:

				  1. Commit your local model changes on a feature branch.
				  2. Switch to main: git checkout main
				  3. Sync remote changes: prismic sync --force
				  4. Commit the synced models.
				  5. Switch back to your branch and merge or rebase main.
				  6. Resolve any JSON conflicts in your editor.
				  7. Push: prismic push

				Re-run with \`--force\` to overwrite remote changes.
			`);
		}
	}

	const customTypeOps = diffOps(localCustomTypeModels, remoteCustomTypes);
	const sliceOps = diffOps(localSliceModels, remoteSlices);

	const destructiveRows = [
		...sliceOps.update.map((m) => ["Overwrite slice", m.id]),
		...sliceOps.delete.map((m) => ["Delete slice", m.id]),
		...customTypeOps.update.map((m) => ["Overwrite type", m.id]),
		...customTypeOps.delete.map((m) => ["Delete type", m.id]),
	];

	if (destructiveRows.length > 0 && !force) {
		throw new CommandError(dedent`
			The following destructive changes will happen:

			  ${formatTable(destructiveRows, { headers: ["OPERATION", "ID"] })}

			Re-run the command with \`--force\` to confirm.
		`);
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

type Ops<T> = { insert: T[]; update: T[]; delete: T[] };

function diffOps<T extends CustomType | SharedSlice>(local: T[], remote: T[]): Ops<T> {
	const ops: Ops<T> = { insert: [], update: [], delete: [] };
	for (const localModel of local) {
		const remoteModel = remote.find((r) => r.id === localModel.id);
		if (!remoteModel) {
			ops.insert.push(localModel);
		} else if (JSON.stringify(localModel) !== JSON.stringify(remoteModel)) {
			ops.update.push(localModel);
		}
	}
	for (const remoteModel of remote) {
		if (!local.some((l) => l.id === remoteModel.id)) {
			ops.delete.push(remoteModel);
		}
	}
	return ops;
}
