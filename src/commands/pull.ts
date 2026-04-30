import { rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { getAdapter, UnresolvedConflictError } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { writeFileRecursive } from "../lib/file";
import { planSync, type SyncConflict } from "../lib/merge";
import { appendTrailingSlash } from "../lib/url";
import { getRepositoryName, readSnapshot, writeSnapshot } from "../project";

const config = {
	name: "prismic pull",
	description: `
		Pull content types and slices from Prismic to local files.

		Local and remote models are merged. When a conflict can't be auto-merged,
		the file is written with conflict markers and a sibling .bak holds the
		pre-merge local. Resolve in your editor and re-run.
	`,
	options: {
		force: { type: "boolean", short: "f", description: "Overwrite local with remote" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { force = false, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const adapter = await getAdapter();

	console.info(`Pulling from repository: ${repo}`);

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

	const [remoteCustomTypes, remoteSlices, snapshot] = await Promise.all([
		getCustomTypes({ repo, token, host }),
		getSlices({ repo, token, host }),
		readSnapshot(repo),
	]);

	if (force) {
		const remoteCustomTypeIds = new Set(remoteCustomTypes.map((c) => c.id));
		const localCustomTypeIds = new Set(localCustomTypes.map((c) => c.model.id));
		for (const model of remoteCustomTypes) {
			if (localCustomTypeIds.has(model.id)) await adapter.updateCustomType(model);
			else await adapter.createCustomType(model);
		}
		for (const { model } of localCustomTypes) {
			if (!remoteCustomTypeIds.has(model.id)) await adapter.deleteCustomType(model.id);
		}
		const remoteSliceIds = new Set(remoteSlices.map((s) => s.id));
		const localSliceIds = new Set(localSlices.map((s) => s.model.id));
		for (const model of remoteSlices) {
			if (localSliceIds.has(model.id)) await adapter.updateSlice(model);
			else await adapter.createSlice(model);
		}
		for (const { model } of localSlices) {
			if (!remoteSliceIds.has(model.id)) await adapter.deleteSlice(model.id);
		}
		await writeSnapshot(repo, { customTypes: remoteCustomTypes, slices: remoteSlices });
		try {
			await adapter.generateTypes();
		} catch (error) {
			console.warn(`Skipped type generation: ${error instanceof Error ? error.message : error}`);
		}
		console.info("Pulled with --force.");
		return;
	}

	for (const ct of localCustomTypes) if (ct.bak) await rm(ct.bak);
	for (const s of localSlices) if (s.bak) await rm(s.bak);

	const customTypePlan = planSync(
		snapshot?.customTypes ?? [],
		localCustomTypes.map((c) => c.model),
		remoteCustomTypes,
	);
	const slicePlan = planSync(
		snapshot?.slices ?? [],
		localSlices.map((s) => s.model),
		remoteSlices,
	);

	for (const model of customTypePlan.ops.insert) await adapter.createCustomType(model);
	for (const model of customTypePlan.ops.update) await adapter.updateCustomType(model);
	for (const m of customTypePlan.ops.delete) await adapter.deleteCustomType(m.id);

	for (const model of slicePlan.ops.insert) await adapter.createSlice(model);
	for (const model of slicePlan.ops.update) await adapter.updateSlice(model);
	for (const m of slicePlan.ops.delete) await adapter.deleteSlice(m.id);

	const conflictPaths: string[] = [];

	for (const c of customTypePlan.conflicts) {
		const localMeta = localCustomTypes.find((x) => x.model.id === c.id);
		const modelPath = localMeta
			? new URL("index.json", appendTrailingSlash(localMeta.directory))
			: await adapter.getCustomTypeModelPath(c.id);
		await writeConflict(modelPath, c);
		conflictPaths.push(fileURLToPath(modelPath));
	}

	for (const c of slicePlan.conflicts) {
		const localMeta = localSlices.find((x) => x.model.id === c.id);
		let modelPath: URL;
		if (localMeta) {
			modelPath = new URL("model.json", appendTrailingSlash(localMeta.directory));
		} else {
			const refModel =
				remoteSlices.find((s) => s.id === c.id) ?? snapshot?.slices.find((s) => s.id === c.id);
			if (!refModel) throw new Error(`Cannot resolve path for slice "${c.id}".`);
			modelPath = await adapter.getSliceModelPath(refModel);
		}
		await writeConflict(modelPath, c);
		conflictPaths.push(fileURLToPath(modelPath));
	}

	await writeSnapshot(repo, { customTypes: remoteCustomTypes, slices: remoteSlices });
	try {
		await adapter.generateTypes();
	} catch (error) {
		console.warn(`Skipped type generation: ${error instanceof Error ? error.message : error}`);
	}

	const merged =
		customTypePlan.ops.insert.length +
		customTypePlan.ops.update.length +
		customTypePlan.ops.delete.length +
		slicePlan.ops.insert.length +
		slicePlan.ops.update.length +
		slicePlan.ops.delete.length;
	if (merged === 0 && conflictPaths.length === 0) {
		console.info("Already up to date.");
	} else if (merged > 0) {
		console.info(`Merged ${merged} model(s).`);
	}
	if (conflictPaths.length > 0) {
		console.warn(`${conflictPaths.length} conflict(s):`);
		for (const path of conflictPaths) console.warn(`  ${path}`);
		console.warn("Resolve in your editor (each .bak holds the pre-merge local), then re-run.");
		process.exitCode = 1;
	}
});

async function writeConflict(modelPath: URL, conflict: SyncConflict): Promise<void> {
	await writeFileRecursive(modelPath, conflict.text);
	await writeFile(new URL(modelPath.href + ".bak"), conflict.localText);
}
