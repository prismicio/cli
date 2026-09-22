export type ArrayDiff<T> = { insert: T[]; update: T[]; delete: T[] };

export function diffArrays<T extends { id: string }>(
	source: T[],
	target: T[],
	normalizeSource: (item: T) => T,
	normalizeTarget = normalizeSource,
): ArrayDiff<T> {
	const diff: ArrayDiff<T> = { insert: [], update: [], delete: [] };
	for (const sourceItem of source) {
		const targetItem = target.find((item) => item.id === sourceItem.id);
		if (!targetItem) {
			diff.insert.push(sourceItem);
		} else if (
			JSON.stringify(normalizeSource(sourceItem)) !== JSON.stringify(normalizeTarget(targetItem))
		) {
			diff.update.push(sourceItem);
		}
	}
	for (const targetItem of target) {
		if (!source.some((item) => item.id === targetItem.id)) {
			diff.delete.push(targetItem);
		}
	}
	return diff;
}
