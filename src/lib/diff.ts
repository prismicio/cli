export type ArrayDiff<T> = { insert: T[]; update: T[]; delete: T[] };

export function diffArrays<T>(
	source: T[],
	target: T[],
	options: {
		getKey: (item: T) => string;
		equals?: (a: T, b: T) => boolean;
	},
): ArrayDiff<T> {
	const { getKey, equals = (a, b) => JSON.stringify(a) === JSON.stringify(b) } = options;
	const diff: ArrayDiff<T> = { insert: [], update: [], delete: [] };
	for (const sourceItem of source) {
		const targetItem = target.find((item) => getKey(item) === getKey(sourceItem));
		if (!targetItem) {
			diff.insert.push(sourceItem);
		} else if (!equals(sourceItem, targetItem)) {
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
