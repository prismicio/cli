import { merge } from "node-diff3";

import { stringify } from "./json";

export type ArrayDiff<T> = { insert: T[]; update: T[]; delete: T[]; conflicts: [] };

export function diffArrays<T>(
	source: T[],
	target: T[],
	options: { getKey: (item: T) => string },
): ArrayDiff<T> {
	const { getKey } = options;
	const diff: ArrayDiff<T> = { insert: [], update: [], delete: [], conflicts: [] };
	for (const sourceItem of source) {
		const targetItem = target.find((item) => getKey(item) === getKey(sourceItem));
		if (!targetItem) {
			diff.insert.push(sourceItem);
		} else if (JSON.stringify(sourceItem) !== JSON.stringify(targetItem)) {
			diff.update.push(sourceItem);
		}
	}
	for (const targetItem of target) {
		if (!source.some((item) => getKey(item) === getKey(targetItem))) {
			diff.delete.push(targetItem);
		}
	}
	return diff;
}

export type ArrayDiff3<T> = {
	insert: T[];
	update: T[];
	delete: T[];
	conflicts: { item: T; conflict: string }[];
};

export function diff3Arrays<T>(
	base: T[] = [],
	local: T[] = [],
	remote: T[] = [],
	options: { getKey: (item: T) => string },
): ArrayDiff3<T> {
	const { getKey } = options;

	const baseMap = new Map(base.map((item) => [getKey(item), item]));
	const localMap = new Map(local.map((item) => [getKey(item), item]));
	const remoteMap = new Map(remote.map((item) => [getKey(item), item]));
	const keys = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);

	const result: ArrayDiff3<T> = { insert: [], update: [], delete: [], conflicts: [] };

	for (const key of keys) {
		const baseItem = baseMap.get(key);
		const localItem = localMap.get(key);
		const remoteItem = remoteMap.get(key);

		const mergeResult = merge(
			localItem ? stringify(localItem).split("\n") : [],
			baseItem ? stringify(baseItem).split("\n") : [],
			remoteItem ? stringify(remoteItem).split("\n") : [],
		);
		const mergedText = mergeResult.result.join("\n");
		const localText = localItem ? stringify(localItem) : "";

		if (mergedText === localText) {
			// no-op
		} else if (mergeResult.conflict) {
			const item = localItem ?? remoteItem;
			if (!item) continue; // Can't happen. At least one side always exists in a conflict
			result.conflicts.push({ item, conflict: mergedText });
		} else if (!localItem) {
			result.insert.push(JSON.parse(mergedText) as T);
		} else if (mergeResult.result.length === 0) {
			result.delete.push(localItem);
		} else {
			result.update.push(JSON.parse(mergedText) as T);
		}
	}

	return result;
}
