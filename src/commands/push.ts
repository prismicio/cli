import { rm } from "node:fs/promises";

import { getAdapter, UnresolvedConflictError } from "../adapters";
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
import { stringify } from "../lib/json";
import { getRepositoryName, readSnapshot, writeSnapshot } from "../project";

const config = {
	name: "prismic push",
	description: `
		Push local content types and slices to Prismic.

		Refuses if remote has changed since the last pull. Run \`prismic pull\` to
		merge remote changes first, then re-run \`prismic push\`.
	`,
	options: {
		force: { type: "boolean", short: "f", description: "Overwrite remote with local" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { force = false, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const adapter = await getAdapter();

	console.info(`Pushing to repository: ${repo}`);

	let localCustomTypes;
	let localSlices;
	try {
		[localCustomTypes, localSlices] = await Promise.all([
			adapter.getCustomTypes(),
			adapter.getSlices(),
		]);
	} catch (error) {
		if (error instanceof UnresolvedConflictError) {
			throw new CommandError(
				`${error.message}\n\nResolve the conflict in the file (the .bak sibling has your pre-merge content), then re-run.`,
			);
		}
		throw error;
	}

	for (const ct of localCustomTypes) if (ct.bak) await rm(ct.bak);
	for (const s of localSlices) if (s.bak) await rm(s.bak);

	const [remoteCustomTypes, remoteSlices, snapshot] = await Promise.all([
		getCustomTypes({ repo, token, host }),
		getSlices({ repo, token, host }),
		readSnapshot(repo),
	]);

	const localCustomTypeModels = localCustomTypes.map((c) => c.model);
	const localSliceModels = localSlices.map((s) => s.model);

	if (!force) {
		const customTypesDrifted =
			stringify(sortById(snapshot?.customTypes ?? [])) !==
			stringify(sortById(remoteCustomTypes));
		const slicesDrifted =
			stringify(sortById(snapshot?.slices ?? [])) !== stringify(sortById(remoteSlices));
		if (customTypesDrifted || slicesDrifted) {
			throw new CommandError(
				"Remote has changed since the last pull. Run `prismic pull` first to merge remote changes, then re-run `prismic push`.",
			);
		}
	}

	const customTypeOps = diffArrays(localCustomTypeModels, remoteCustomTypes, {
		key: (m) => m.id,
	});
	const sliceOps = diffArrays(localSliceModels, remoteSlices, { key: (m) => m.id });

	for (const model of customTypeOps.insert) await insertCustomType(model, { repo, token, host });
	for (const model of customTypeOps.update) await updateCustomType(model, { repo, token, host });
	for (const m of customTypeOps.delete) await removeCustomType(m.id, { repo, token, host });

	for (const model of sliceOps.insert) await insertSlice(model, { repo, token, host });
	for (const model of sliceOps.update) await updateSlice(model, { repo, token, host });
	for (const m of sliceOps.delete) await removeSlice(m.id, { repo, token, host });

	const [newRemoteCustomTypes, newRemoteSlices] = await Promise.all([
		getCustomTypes({ repo, token, host }),
		getSlices({ repo, token, host }),
	]);
	await writeSnapshot(repo, { customTypes: newRemoteCustomTypes, slices: newRemoteSlices });

	const total =
		customTypeOps.insert.length +
		customTypeOps.update.length +
		customTypeOps.delete.length +
		sliceOps.insert.length +
		sliceOps.update.length +
		sliceOps.delete.length;
	if (total === 0) console.info("Already up to date.");
	else console.info(`Pushed ${total} model(s).`);
});

function sortById<T extends { id: string }>(items: T[]): T[] {
	return [...items].sort((a, b) => a.id.localeCompare(b.id));
}
