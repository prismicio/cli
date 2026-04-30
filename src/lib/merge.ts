import { merge as diff3Merge } from "node-diff3";

import { type ArrayDiff, diffArrays } from "./diff";
import { stringify } from "./json";

export type SyncConflict = {
	id: string;
	text: string;
	localText: string;
};

export type SyncPlan<M> = {
	ops: ArrayDiff<M>;
	conflicts: SyncConflict[];
};

export function planSync<M extends { id: string }>(
	base: M[],
	local: M[],
	remote: M[],
): SyncPlan<M> {
	const baseMap = new Map(base.map((m) => [m.id, m]));
	const localMap = new Map(local.map((m) => [m.id, m]));
	const remoteMap = new Map(remote.map((m) => [m.id, m]));
	const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);

	const canonical: M[] = [];
	const conflicts: SyncConflict[] = [];

	for (const id of ids) {
		const baseModel = baseMap.get(id);
		const localModel = localMap.get(id);
		const remoteModel = remoteMap.get(id);
		const baseText = baseModel ? stringify(baseModel) : "";
		const localText = localModel ? stringify(localModel) : "";
		const remoteText = remoteModel ? stringify(remoteModel) : "";
		const result = diff3Merge(
			localText.split("\n"),
			baseText.split("\n"),
			remoteText.split("\n"),
		);
		const text = result.result.join("\n");
		if (result.conflict) {
			conflicts.push({ id, text, localText });
			continue;
		}
		if (text.trim() === "") continue;
		try {
			canonical.push(JSON.parse(text) as M);
		} catch {
			conflicts.push({ id, text, localText });
		}
	}

	const conflictIds = new Set(conflicts.map((c) => c.id));
	const localFiltered = local.filter((m) => !conflictIds.has(m.id));
	const ops = diffArrays(canonical, localFiltered, { key: (m) => m.id });

	return { ops, conflicts };
}
