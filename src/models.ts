import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import type { Adapter } from "./adapters";
import type { ArrayDiff } from "./lib/diff";

import { getDirtyPaths } from "./lib/git";
import { isDescendant, relativePathname } from "./lib/url";

export async function getDirtyModelFiles(config: {
	gitRoot: URL;
	projectRoot: URL;
	customTypeLibraries: URL[];
	sliceLibraries: URL[];
}): Promise<string[]> {
	const { gitRoot, projectRoot, customTypeLibraries, sliceLibraries } = config;
	return (await getDirtyPaths(gitRoot))
		.filter(
			(path) =>
				(path.pathname.endsWith("/model.json") &&
					sliceLibraries.some((lib) => isDescendant(lib, path))) ||
				(path.pathname.endsWith("/index.json") &&
					customTypeLibraries.some((lib) => isDescendant(lib, path))),
		)
		.map((path) => relativePathname(projectRoot, path));
}

export async function writeModelOps(
	adapter: Adapter,
	customTypeOps: ArrayDiff<CustomType>,
	sliceOps: ArrayDiff<SharedSlice>,
): Promise<void> {
	for (const model of sliceOps.update) await adapter.updateSlice(model);
	for (const model of sliceOps.delete) await adapter.deleteSlice(model.id);
	for (const model of sliceOps.insert) await adapter.createSlice(model);
	for (const model of customTypeOps.update) await adapter.updateCustomType(model);
	for (const model of customTypeOps.delete) await adapter.deleteCustomType(model.id);
	for (const model of customTypeOps.insert) await adapter.createCustomType(model);
}
