import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { glob } from "tinyglobby";
import { expect } from "vitest";

import { getSliceLibraries } from "./it";

declare module "vitest" {
	// oxlint-disable-next-line no-explicit-any
	interface Matchers<T = any> {
		toContainCustomType(customType: CustomType): Promise<T>;
		toContainSlice(slice: SharedSlice): Promise<T>;
		toHaveRoute(route: { type: string; path?: string }): Promise<T>;
		toHaveFile(path: string | URL, args?: { contains?: string }): Promise<T>;
	}
}

expect.extend({
	async toContainCustomType(project, customType) {
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

	async toContainSlice(project, slice) {
		const problems: string[] = [];

		const libraries = await getSliceLibraries(project);
		let sliceDirectory;
		for (const library of libraries) {
			const sliceModelPaths = Array.from(
				await glob("*/model.json", { absolute: true, cwd: library }),
				(path) => pathToFileURL(path),
			);
			for (const sliceModelPath of sliceModelPaths) {
				const model: SharedSlice = JSON.parse(await readFile(sliceModelPath, "utf8"));
				if (model.id === slice.id) {
					sliceDirectory = new URL(".", sliceModelPath);
				}
			}
		}

		if (!sliceDirectory) {
			problems.push(`slice model file does not exist`);
		} else {
			const sliceIndexPath = new URL("../index.js", sliceDirectory);
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

			const componentPath = new URL("index.jsx", sliceDirectory);
			try {
				const componentFile = await readFile(componentPath, "utf-8");
				if (!componentFile.includes(slice.name)) {
					problems.push(`slice component file (${componentPath.href}) does not contain slice name`);
				}
			} catch {
				problems.push(`slice component file (${componentPath.href}) does not exist`);
			}
		}

		return {
			pass: problems.length === 0,
			message: () =>
				problems.length > 0
					? problems.join("\n")
					: `expected project not to contain slice "${slice.id}", but all parts exist`,
		};
	},

	async toHaveFile(project, path, args = {}) {
		const { contains } = args;

		const problems: string[] = [];

		const filePath = new URL(path, project);
		try {
			const contents = await readFile(filePath, "utf-8");
			if (contains && !contents.includes(contains)) {
				problems.push(`file (${filePath.href}) does not contain "${contains}"`);
			}
		} catch {
			problems.push(`file (${filePath.href}) does not exist`);
		}

		return {
			pass: problems.length === 0,
			message: () =>
				problems.length > 0
					? problems.join("\n")
					: `expected project not to have file at "${path}", but it exists`,
		};
	},

	async toHaveRoute(project, route) {
		const problems: string[] = [];

		const configPath = new URL("prismic.config.json", project);
		try {
			const config: { routes?: { type: string; path: string }[] } = JSON.parse(
				await readFile(configPath, "utf-8"),
			);
			const hasRoute = config.routes?.find((r) => {
				if (r.type !== route.type) return false;
				if (route.path) return r.path === route.path;
				return true;
			});
			if (!hasRoute) {
				problems.push(`config file (${configPath.href}) does not contain route`);
			}
		} catch {
			problems.push(`config file (${configPath.href}) does not exist`);
		}

		return {
			pass: problems.length === 0,
			message: () =>
				problems.length > 0
					? problems.join("\n")
					: `expected project not to contain route, but it exists`,
		};
	},
});
