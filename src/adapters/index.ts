import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { pascalCase } from "change-case";
import { rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateTypes } from "prismic-ts-codegen";
import { glob } from "tinyglobby";

import { addRoute, removeRoute, updateRoute } from "../config";
import { readJsonFile, writeFileRecursive } from "../lib/file";
import { stringify } from "../lib/json";
import { readPackageJson } from "../lib/packageJson";
import { appendTrailingSlash } from "../lib/url";
import { findProjectRoot, getLibraries } from "../project";

const TYPES_FILENAME = "prismicio-types.d.ts";

export type CustomTypeMeta = { model: CustomType; directory: URL };
export type SharedSliceMeta = { model: SharedSlice; directory: URL; library: URL };

export async function getAdapter(): Promise<Adapter> {
	const { dependencies, devDependencies, peerDependencies } = await readPackageJson();
	const allDependencies = { ...dependencies, ...devDependencies, ...peerDependencies };
	if ("next" in allDependencies) {
		const { NextJsAdapter } = await import("./nextjs");
		return new NextJsAdapter();
	}
	if ("nuxt" in allDependencies) {
		const { NuxtAdapter } = await import("./nuxt");
		return new NuxtAdapter();
	}
	if ("@sveltejs/kit" in allDependencies) {
		const { SvelteKitAdapter } = await import("./sveltekit");
		return new SvelteKitAdapter();
	}
	throw new NoSupportedFrameworkError();
}

export class NoSupportedFrameworkError extends Error {
	message = "No supported framework found (Next.js, Nuxt, or SvelteKit required)";
}

export abstract class Adapter {
	abstract readonly id: string;

	abstract onProjectInitialized(): Promise<void> | void;
	abstract onSliceCreated(model: SharedSlice, library: URL): Promise<void> | void;
	abstract onSliceUpdated(model: SharedSlice): Promise<void> | void;
	abstract onSliceDeleted(id: string): Promise<void> | void;
	abstract onCustomTypeCreated(model: CustomType): Promise<void> | void;
	abstract onCustomTypeUpdated(model: CustomType): Promise<void> | void;
	abstract onCustomTypeDeleted(id: string): Promise<void> | void;

	abstract setupProject(): Promise<void>;
	abstract createSliceIndexFile(library: URL): Promise<void>;
	abstract getDefaultSliceLibrary(): Promise<URL>;

	async initProject(): Promise<void> {
		const libraries = await this.getSliceLibraries();
		for (const library of libraries) {
			await this.createSliceIndexFile(library);
		}
		await this.setupProject();
		await this.onProjectInitialized();
	}

	async getSliceLibraries(): Promise<URL[]> {
		let libraries = await getLibraries();
		if (libraries) return libraries;
		const defaultSliceLibrary = await this.getDefaultSliceLibrary();
		return [defaultSliceLibrary];
	}

	async getSlices(): Promise<SharedSliceMeta[]> {
		const allSlices: SharedSliceMeta[] = [];

		const libraries = await this.getSliceLibraries();
		for (const library of libraries) {
			const modelGlob = new URL("*/model.json", library);
			const sliceModelPaths = Array.from(
				await glob(fileURLToPath(modelGlob), { absolute: true }),
				(path) => pathToFileURL(path),
			);
			const slices = await Promise.all(
				sliceModelPaths.map(async (sliceModelPath) => {
					const directory = new URL(".", sliceModelPath);
					const model = await readJsonFile<SharedSlice>(sliceModelPath);
					return { library, directory, model };
				}),
			);
			allSlices.push(...slices);
		}

		return allSlices.sort((a, b) =>
			a.model.id.toLowerCase().localeCompare(b.model.id.toLowerCase()),
		);
	}

	async getSlice(id: string): Promise<SharedSliceMeta> {
		const slices = await this.getSlices();
		const slice = slices.find((s) => s.model.id === id);
		if (!slice) throw new Error(`No slice found with ID: ${id}`);
		return slice;
	}

	async createSlice(model: SharedSlice, library?: URL): Promise<void> {
		library ??= await this.getDefaultSliceLibrary();
		const sliceDirectoryName = pascalCase(model.name);
		const sliceDirectory = new URL(sliceDirectoryName, appendTrailingSlash(library));
		const modelPath = new URL("model.json", appendTrailingSlash(sliceDirectory));
		await writeFileRecursive(modelPath, stringify(model));
		await this.createSliceIndexFile(library);
		await this.onSliceCreated(model, library);
	}

	async updateSlice(model: SharedSlice): Promise<void> {
		const slice = await this.getSlice(model.id);
		const modelPath = new URL("model.json", appendTrailingSlash(slice.directory));
		await writeFileRecursive(modelPath, stringify(model));
		await this.onSliceUpdated(model);
	}

	async deleteSlice(id: string): Promise<void> {
		const slice = await this.getSlice(id);
		await rm(slice.directory, { recursive: true });
		await this.createSliceIndexFile(slice.library);
		await this.onSliceDeleted(id);
	}

	async getCustomTypes(): Promise<CustomTypeMeta[]> {
		const projectRoot = await findProjectRoot();
		const customTypesDirectory = new URL("customtypes/", projectRoot);
		const modelGlob = new URL("*/index.json", customTypesDirectory);
		const customTypeModelPaths = Array.from(
			await glob(fileURLToPath(modelGlob), { absolute: true }),
			(path) => pathToFileURL(path),
		);

		const customTypes = await Promise.all(
			customTypeModelPaths.map(async (customTypeModelPath) => {
				const directory = new URL(".", customTypeModelPath);
				const model = await readJsonFile<CustomType>(customTypeModelPath);
				return { directory, model };
			}),
		);

		return customTypes.sort((a, b) =>
			a.model.id.toLowerCase().localeCompare(b.model.id.toLowerCase()),
		);
	}

	async getCustomType(id: string): Promise<CustomTypeMeta> {
		const customTypes = await this.getCustomTypes();
		const customType = customTypes.find((s) => s.model.id === id);
		if (!customType) throw new Error(`No custom type found with ID: ${id}`);
		return customType;
	}

	async createCustomType(model: CustomType): Promise<void> {
		const projectRoot = await findProjectRoot();
		const customTypesDirectory = new URL("customtypes/", projectRoot);
		const modelPath = new URL(`${model.id}/index.json`, customTypesDirectory);
		await writeFileRecursive(modelPath, stringify(model));
		if (model.format === "page") await addRoute(model);
		await this.onCustomTypeCreated(model);
	}

	async updateCustomType(model: CustomType): Promise<void> {
		const customType = await this.getCustomType(model.id);
		const modelPath = new URL("index.json", appendTrailingSlash(customType.directory));
		await writeFileRecursive(modelPath, stringify(model));
		await updateRoute(model);
		await this.onCustomTypeUpdated(model);
	}

	async deleteCustomType(id: string): Promise<void> {
		const customType = await this.getCustomType(id);
		await rm(customType.directory, { recursive: true });
		await removeRoute(id);
		await this.onCustomTypeDeleted(id);
	}

	async generateTypes(): Promise<URL> {
		const projectRoot = await findProjectRoot();
		const output = new URL(TYPES_FILENAME, projectRoot);
		const slices = await this.getSlices();
		const customTypes = await this.getCustomTypes();
		const types = generateTypes({
			customTypeModels: customTypes.map((customType) => customType.model),
			sharedSliceModels: slices.map((slice) => slice.model),
			clientIntegration: {
				includeContentNamespace: true,
				includeCreateClientInterface: true,
			},
			cache: true,
			typesProvider: "@prismicio/client",
		});
		await writeFileRecursive(output, types);
		return output;
	}
}
