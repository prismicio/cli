import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { pascalCase } from "change-case";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { glob } from "tinyglobby";
import * as v from "valibot";

import { readConfig } from "./config";
import { exists, findUpward } from "./file";
import { stringify } from "./json";
import { addDependencies } from "./packageJson";
import { dedent } from "./string";
import { appendTrailingSlash } from "./url";

export abstract class FrameworkAdapter {
	abstract readonly id: Framework;

	abstract getDependencies(): Promise<Record<string, string>>;

	abstract getClientFilePath(): Promise<string | null>;

	abstract getSlicesDirectoryPath(): Promise<string>;

	abstract getSliceComponentExtensions(): string[];

	abstract getRoutePath(route: string): Promise<{ path: string; extensions: string[] } | null>;

	abstract createSliceComponent(
		model: SharedSlice,
		sliceDirectory: URL,
	): Promise<{ componentPath: URL }>;

	abstract getSliceImportPath(relativeDirectory: string): string;

	abstract getDefaultSliceLibraryPath(projectRoot: URL): Promise<URL>;

	async initProject(): Promise<void> {
		const deps = await this.getDependencies();
		await addDependencies(deps);
		const libraries = await this.#getSliceLibraries();
		for (const library of libraries) {
			await this.#updateSliceLibraryIndexFile(library);
		}
	}

	async createSlice(
		model: SharedSlice,
		library: URL,
	): Promise<{ modelPath: URL; componentPath: URL; indexPath: URL }> {
		const { modelPath } = await this.#writeSliceModel(model, library);
		const sliceDirectory = await this.#getSliceDirectory(model.name, library);
		const { componentPath } = await this.createSliceComponent(model, sliceDirectory);
		const { indexPath } = await this.#updateSliceLibraryIndexFile(library);
		return { modelPath, componentPath, indexPath };
	}

	async readSlice(sliceId: string): Promise<SharedSlice> {
		const slice = await this.#findSlice(sliceId);
		return slice.model;
	}

	async updateSlice(model: SharedSlice): Promise<{ modelPath: URL; indexPath: URL }> {
		const existingSlice = await this.#findSlice(model.id);
		const { modelPath } = await this.#writeSliceModel(model, existingSlice.library);
		const { indexPath } = await this.#updateSliceLibraryIndexFile(existingSlice.library);
		return { modelPath, indexPath };
	}

	async renameSlice(model: SharedSlice): Promise<{ modelPath: URL; indexPath: URL }> {
		const existingSlice = await this.#findSlice(model.id);
		const newSliceDirectory = await this.#getSliceDirectory(model.name, existingSlice.library);
		await rename(existingSlice.directory, newSliceDirectory);
		const { modelPath } = await this.#writeSliceModel(model, existingSlice.library);
		const { indexPath } = await this.#updateSliceLibraryIndexFile(existingSlice.library);
		return { modelPath, indexPath };
	}

	async deleteSlice(sliceId: string): Promise<{ sliceDirectory: URL; indexPath: URL }> {
		const slice = await this.#findSlice(sliceId);
		await rm(slice.directory, { recursive: true });
		const { indexPath } = await this.#updateSliceLibraryIndexFile(slice.library);
		return { sliceDirectory: slice.directory, indexPath };
	}

	async getSlices(library?: URL): Promise<{ library: URL; directory: URL; model: SharedSlice }[]> {
		const libraryDirs = library ? [library] : await this.#getSliceLibraries();
		const allSlices: {
			library: URL;
			directory: URL;
			model: SharedSlice;
		}[] = [];

		for (const libraryDir of libraryDirs) {
			const modelGlob = new URL("*/model.json", libraryDir);
			const sliceModelPaths = Array.from(
				await glob(fileURLToPath(modelGlob), { absolute: true }),
				(path) => pathToFileURL(path),
			);
			const slices = await Promise.all(
				sliceModelPaths.map(async (sliceModelPath) => {
					const directory = new URL(".", sliceModelPath);
					const model = await readFile(sliceModelPath, "utf8");
					return {
						library: libraryDir,
						directory,
						model: JSON.parse(model),
					};
				}),
			);
			allSlices.push(...slices);
		}

		return allSlices;
	}

	async getDefaultSliceLibrary(): Promise<URL> {
		const dirs = await this.#getSliceLibraries();
		return dirs[0];
	}

	async createCustomType(model: CustomType): Promise<{ modelPath: URL }> {
		const { modelPath } = await this.#writeCustomType(model);
		return { modelPath };
	}

	async readCustomType(customTypeId: string): Promise<CustomType> {
		const customTypeDirectory = await this.#getCustomTypeDirectory(customTypeId);
		const modelPath = new URL("index.json", customTypeDirectory);
		const model = await readFile(modelPath, "utf8");
		const json = JSON.parse(model);
		return json;
	}

	async updateCustomType(model: CustomType): Promise<{ modelPath: URL }> {
		const { modelPath } = await this.#writeCustomType(model);
		return { modelPath };
	}

	async renameCustomType(model: CustomType): Promise<{ modelPath: URL }> {
		const existingCustomTypeDirectory = await this.#getCustomTypeDirectory(model.id);
		const newCustomTypeDirectory = await this.#getCustomTypeDirectory(model.id);
		await rename(existingCustomTypeDirectory, newCustomTypeDirectory);
		const { modelPath } = await this.#writeCustomType(model);
		return { modelPath };
	}

	async deleteCustomType(customTypeId: string): Promise<{ customTypeDirectory: URL }> {
		const customTypeDirectory = await this.#getCustomTypeDirectory(customTypeId);
		await rm(customTypeDirectory, { recursive: true });
		return { customTypeDirectory };
	}

	async getCustomTypes(): Promise<{ directory: URL; model: CustomType }[]> {
		const customTypesDirectory = await this.#getCustomTypesDirectory();
		const modelGlob = new URL("*/index.json", customTypesDirectory);
		const customTypeModelPaths = Array.from(
			await glob(fileURLToPath(modelGlob), { absolute: true }),
			(path) => pathToFileURL(path),
		);
		const customTypes = await Promise.all(
			customTypeModelPaths.map(async (customTypeModelPath) => {
				const directory = new URL(".", customTypeModelPath);
				const model = await readFile(customTypeModelPath, "utf8");
				return {
					directory,
					model: JSON.parse(model),
				};
			}),
		);
		return customTypes;
	}

	async getProjectRoot(): Promise<URL> {
		const packageJsonPath = await findUpward("package.json");
		if (!packageJsonPath) {
			throw new Error("No package.json found");
		}
		const projectRoot = new URL("./", packageJsonPath);
		return projectRoot;
	}

	protected async checkIsTypeScriptProject(): Promise<boolean> {
		const projectRoot = await this.getProjectRoot();
		const tsconfigPath = new URL("tsconfig.json", projectRoot);
		const isTypeScriptProject = await exists(tsconfigPath);
		return isTypeScriptProject;
	}

	protected async getJsFileExtension(): Promise<string> {
		const isTypeScriptProject = await this.checkIsTypeScriptProject();
		const jsFileExtension = isTypeScriptProject ? "ts" : "js";
		return jsFileExtension;
	}

	async #findSlice(sliceId: string): Promise<{ library: URL; directory: URL; model: SharedSlice }> {
		const slices = await this.getSlices();
		const slice = slices.find((slice) => slice.model.id === sliceId);
		if (!slice) throw new Error(`No slice found with ID: ${sliceId}`);
		return slice;
	}

	async #writeSliceModel(model: SharedSlice, library: URL): Promise<{ modelPath: URL }> {
		const sliceDirectory = await this.#getSliceDirectory(model.name, library);
		await mkdir(sliceDirectory, { recursive: true });
		const modelPath = new URL("model.json", sliceDirectory);
		const formattedModel = this.#formatModel(model);
		await writeFile(modelPath, formattedModel);
		return { modelPath };
	}

	async #getSliceDirectory(sliceName: string, library: URL): Promise<URL> {
		const sliceDirectoryName = pascalCase(sliceName);
		const sliceDirectory = appendTrailingSlash(new URL(sliceDirectoryName, library));
		return sliceDirectory;
	}

	async #getSliceLibraries(): Promise<URL[]> {
		const projectRoot = await this.getProjectRoot();
		const configResult = await readConfig();
		const sliceLibraries = configResult.ok ? configResult.config.libraries : undefined;

		if (sliceLibraries?.length) {
			return sliceLibraries.map((sliceLibrary) => {
				const withoutLeadingSlash = sliceLibrary.replace(/^\//, "");
				return appendTrailingSlash(new URL(withoutLeadingSlash, projectRoot));
			});
		}

		return [await this.getDefaultSliceLibraryPath(projectRoot)];
	}

	async #updateSliceLibraryIndexFile(library: URL): Promise<{ indexPath: URL }> {
		const slices = await this.getSlices(library);
		const contents = await this.generateSliceLibraryIndexContents(slices);
		const extension = await this.getJsFileExtension();
		const filename = `index.${extension}`;
		const indexPath = new URL(filename, library);
		await writeFile(indexPath, contents);
		return { indexPath };
	}

	protected async generateSliceLibraryIndexContents(
		slices: { library: URL; directory: URL; model: SharedSlice }[],
	): Promise<string> {
		const imports = slices.map((slice) => {
			const componentName = pascalCase(slice.model.name);
			const relativeDirectory = relative(
				fileURLToPath(slice.library),
				fileURLToPath(slice.directory),
			);
			return `import ${componentName} from "${this.getSliceImportPath(relativeDirectory)}";`;
		});
		const componentLines = slices.map((slice) => {
			const componentName = pascalCase(slice.model.name);
			return `${slice.model.id}: ${componentName}`;
		});
		return dedent`
			// Code generated by Prismic. DO NOT EDIT.

			${imports.join("\n")}

			export const components = {
				${componentLines.join(",\n")}
			};
		`;
	}

	async #writeCustomType(model: CustomType): Promise<{ modelPath: URL }> {
		const customTypeDirectory = await this.#getCustomTypeDirectory(model.id);
		await mkdir(customTypeDirectory, { recursive: true });
		const modelPath = new URL("index.json", customTypeDirectory);
		const formattedModel = this.#formatModel(model);
		await writeFile(modelPath, formattedModel);
		return { modelPath };
	}

	async #getCustomTypeDirectory(customTypeId: string): Promise<URL> {
		const customTypesDirectory = await this.#getCustomTypesDirectory();
		const customTypeDirectoryName = customTypeId;
		const customTypeDirectory = appendTrailingSlash(
			new URL(customTypeDirectoryName, customTypesDirectory),
		);
		return customTypeDirectory;
	}

	async #getCustomTypesDirectory(): Promise<URL> {
		const projectRoot = await this.getProjectRoot();
		const customTypesDirectory = new URL(`customtypes/`, projectRoot);
		return customTypesDirectory;
	}

	#formatModel(model: CustomType | SharedSlice): string {
		const formattedModel = stringify(model);
		return formattedModel;
	}
}

export function getDocsPath(framework: Framework): string {
	switch (framework) {
		case "next":
			return "nextjs/with-cli";
		case "nuxt":
			return "nuxt/with-cli";
		case "sveltekit":
			return "sveltekit/with-cli";
	}
}

export function getWriteComponentsAnchor(framework: Framework): string {
	switch (framework) {
		case "nuxt":
			return "#write-vue-components";
		case "sveltekit":
			return "#write-svelte-components";
		default:
			return "#write-react-components";
	}
}

export function getClientSetupAnchor(framework: Framework): string {
	switch (framework) {
		case "nuxt":
			return "#configure-the-modules-prismic-client";
		default:
			return "#set-up-a-prismic-client";
	}
}

export function getPreviewSetupAnchor(framework: Framework): string {
	switch (framework) {
		case "next":
			return "#set-up-previews-in-next-js";
		case "sveltekit":
			return "#set-up-previews-in-sveltekit";
		default:
			return "";
	}
}

const PackageJsonSchema = v.object({
	dependencies: v.optional(v.record(v.string(), v.string())),
	devDependencies: v.optional(v.record(v.string(), v.string())),
});

export type Framework = "next" | "nuxt" | "sveltekit";

export async function requireFramework(): Promise<FrameworkAdapter | undefined> {
	const framework = await getFramework();
	if (!framework) {
		console.error("No supported framework found (Next.js, Nuxt, or SvelteKit required)");
		console.error("Ensure your project has the framework listed as a dependency in package.json");
		process.exitCode = 1;
		return undefined;
	}
	return framework;
}

export async function getFramework(): Promise<FrameworkAdapter | undefined> {
	const id = await detectFramework();
	switch (id) {
		case "next": {
			const { NextJsFramework } = await import("./framework-nextjs");
			return new NextJsFramework();
		}
		case "nuxt": {
			const { NuxtFramework } = await import("./framework-nuxt");
			return new NuxtFramework();
		}
		case "sveltekit": {
			const { SvelteKitFramework } = await import("./framework-sveltekit");
			return new SvelteKitFramework();
		}
		default:
			return undefined;
	}
}

async function detectFramework(): Promise<Framework | undefined> {
	const packageJsonPath = await findUpward("package.json");
	if (!packageJsonPath) return undefined;

	try {
		const contents = await readFile(packageJsonPath, "utf8");
		const { dependencies = {}, devDependencies = {} } = v.parse(
			PackageJsonSchema,
			JSON.parse(contents),
		);
		const allDeps = { ...dependencies, ...devDependencies };
		if ("next" in allDeps) return "next";
		if ("nuxt" in allDeps) return "nuxt";
		if ("@sveltejs/kit" in allDeps) return "sveltekit";
	} catch {
		// Continue with undefined
	}

	return undefined;
}
