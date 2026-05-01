export type ArrayDiff<T> = { insert: T[]; update: T[]; delete: T[] };

export function diffArrays<T>(
	source: T[],
	target: T[],
	options: { getKey: (item: T) => string },
): ArrayDiff<T> {
	const { getKey } = options;
	const diff: ArrayDiff<T> = { insert: [], update: [], delete: [] };
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
