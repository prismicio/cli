import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { readFile } from "node:fs/promises";
import { expect } from "vitest";

declare module "vitest" {
	// oxlint-disable-next-line no-explicit-any
	interface Matchers<T = any> {
		toContainCustomType(customType: CustomType): Promise<T>;
		toContainSlice(slice: SharedSlice): Promise<T>;
	}
}

expect.extend({
	async toContainCustomType(project: URL, customType: CustomType) {
		const problems: string[] = [];

		const modelPath = new URL(`customtypes/${customType.id}/index.json`, project);
		try {
			const model: CustomType = JSON.parse(await readFile(modelPath, "utf8"));
			if (model.id !== customType.id) {
				problems.push(`custom type model file (${modelPath.href}) has wrong ID`);
			}
		} catch {
			problems.push(`custom type model file (${modelPath.href}) does not exist`);
		}

		return {
			pass: problems.length === 0,
			message: () =>
				problems.length > 0
					? problems.join("\n")
					: `expected project not to contain custom type "${customType.id}", but it exists`,
		};
	},

	async toContainSlice(project: URL, slice: SharedSlice) {
		const problems: string[] = [];

		const sliceIndexPath = new URL("slices/index.js", project);
		try {
			const sliceIndex = await readFile(sliceIndexPath, "utf8");
			if (!new RegExp(`\\b${slice.id}: `).test(sliceIndex)) {
				problems.push(
					`slice "${slice.id}" not found in slice library index (${sliceIndexPath.href})`,
				);
			}
		} catch {
			problems.push(`slice library index (${sliceIndexPath.href}) does not exist`);
		}

		const modelPath = new URL(`slices/${slice.name}/model.json`, project);
		try {
			const model: SharedSlice = JSON.parse(await readFile(modelPath, "utf8"));
			if (model.id !== slice.id) {
				problems.push(`slice model file (${modelPath.href}) has wrong ID`);
			}
		} catch {
			problems.push(`slice model file (${modelPath.href}) does not exist`);
		}

		const componentPath = new URL(`slices/${slice.name}/index.jsx`, project);
		try {
			const componentFile = await readFile(componentPath, "utf-8");
			if (!componentFile.includes(slice.name)) {
				problems.push(`slice component file (${componentPath.href}) does not contain slice name`);
			}
		} catch {
			problems.push(`slice component file (${componentPath.href}) does not exist`);
		}

		return {
			pass: problems.length === 0,
			message: () =>
				problems.length > 0
					? problems.join("\n")
					: `expected project not to contain slice "${slice.id}", but all parts exist`,
		};
	},
});
