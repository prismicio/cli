import { readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { DynamicCustomTypeModel, SharedSliceModel } from "@prismicio/types-internal";
import { pascalCase } from "change-case";
import { generateTypes } from "prismic-ts-codegen";
import { glob } from "tinyglobby";

import { getCredentials } from "../auth";
import {
	exists,
	readEnvFile,
	readJsonFile,
	setEnvFileVar,
	unsetEnvFileVar,
	writeFileRecursive,
} from "../lib/file";
import { stringify } from "../lib/json";
import { findPackageJson, readPackageJson } from "../lib/packageJson";
import {
	addPreview,
	getPreviews,
	getSimulatorUrl,
	setSimulatorUrl,
} from "../lib/prismic/clients/core";
import {
	canonicalizeCustomType,
	canonicalizeSlice,
	type Models,
	type ModelsDiff,
} from "../lib/prismic/models";
import { appendTrailingSlash, relativePathname } from "../lib/url";
import {
	addRoute,
	buildRoutePath,
	checkIsTypeScriptProject,
	findProjectRoot,
	getLibraries,
	getRepositoryName,
	removeRoute,
	updateRoute,
} from "../project";

type ModelMeta<T> = { model: T; modelPath: URL; directory: URL; library: URL };

export const FRAMEWORKS = ["next", "nuxt", "sveltekit"];

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
	name = "NoSupportedFrameworkError";
	message =
		"No supported framework found. Run this command in a Next.js, Nuxt, or SvelteKit project.";
}

export class ModelExistsError extends Error {
	name = "ModelExistsError";
}

async function assertModelMissing(
	kind: string,
	id: string,
	directory: URL,
	models: ModelMeta<{ id: string }>[],
): Promise<void> {
	const existing = models.find((m) => m.model.id === id || m.directory.href === directory.href);
	if (!existing && !(await exists(directory))) return;
	const path = relativePathname(await findProjectRoot(), existing?.directory ?? directory);
	const suffix = existing ? ` (id: ${existing.model.id})` : "";
	throw new ModelExistsError(`A ${kind} already exists at ${path}${sep}${suffix}.`);
}

export async function getActiveRepositoryName(): Promise<string> {
	const adapter = await getAdapter();
	return (await adapter.getEnvironment()) ?? (await getRepositoryName());
}

export async function checkSourceContains(text: string): Promise<boolean> {
	const paths = await glob("**/*.{js,jsx,mjs,ts,tsx,mts,svelte}", {
		// A URL cwd silently disables `ignore`, so node_modules must be a path.
		cwd: fileURLToPath(await findProjectRoot()),
		absolute: true,
		ignore: "**/{node_modules,build,dist,out}/**",
	});
	for (const path of paths) {
		try {
			if ((await readFile(path, "utf8")).includes(text)) return true;
		} catch {}
	}
	return false;
}

export async function writeFileIfMissing(path: URL, contents: string): Promise<void> {
	if (await exists(path)) return;
	await writeFileRecursive(path, contents);
}

export async function getJsFileExtension(): Promise<string> {
	return (await checkIsTypeScriptProject()) ? "ts" : "js";
}

export async function getInstalledMajor(packageName: string): Promise<number> {
	const require = createRequire(await findPackageJson());
	try {
		const { version } = require(`${packageName}/package.json`);
		const major = Number.parseInt(version.split(".")[0]);
		return Number.isNaN(major) ? Infinity : major;
	} catch {
		// Not installed yet, so assume the newest major.
		return Infinity;
	}
}

export abstract class Adapter {
	abstract readonly id: string;
	abstract readonly environmentEnvVarName: string;
	abstract readonly localPreviewConfig: { name: string; websiteURL: string; resolverPath: string };

	get localPreviewUrl(): string {
		return new URL(this.localPreviewConfig.resolverPath, this.localPreviewConfig.websiteURL).href;
	}

	get localSimulatorUrl(): string {
		return new URL("slice-simulator", this.localPreviewConfig.websiteURL).href;
	}

	abstract setupProject(): Promise<void>;
	abstract getPreviewComponentInstructions(): Promise<string | undefined>;
	abstract createSliceIndexFile(library: URL): Promise<void>;
	protected abstract getDefaultSliceLibrary(): Promise<URL>;
	protected abstract createSliceComponent(model: SharedSliceModel, directory: URL): Promise<void>;
	protected abstract createPageFile(
		model: DynamicCustomTypeModel,
		routePath: string,
	): Promise<void>;

	async initProject({ setup }: { setup: boolean }): Promise<void> {
		for (const library of await this.getSliceLibraries()) {
			await this.createSliceIndexFile(library);
		}
		if (setup) await this.setupProject();

		const config = { repo: await getRepositoryName(), ...(await getCredentials()) };
		if (!(await getSimulatorUrl(config))) {
			await setSimulatorUrl(this.localSimulatorUrl, config);
		}
		if ((await getPreviews(config)).length === 0) {
			await addPreview(this.localPreviewConfig, config);
		}
	}

	async getSliceLibraries(): Promise<URL[]> {
		return (await getLibraries()) ?? [await this.getDefaultSliceLibrary()];
	}

	async getSlices(): Promise<ModelMeta<SharedSliceModel>[]> {
		return readModels(await this.getSliceLibraries(), "*/model.json");
	}

	async getSlice(id: string): Promise<ModelMeta<SharedSliceModel>> {
		const slice = (await this.getSlices()).find((s) => s.model.id === id);
		if (!slice) throw new Error(`No slice found with ID: ${id}`);
		return slice;
	}

	async createSlice(model: SharedSliceModel): Promise<void> {
		const [library] = await this.getSliceLibraries();
		const directory = appendTrailingSlash(
			new URL(pascalCase(model.name), appendTrailingSlash(library)),
		);
		await assertModelMissing("slice", model.id, directory, await this.getSlices());
		await writeFileRecursive(new URL("model.json", directory), stringify(canonicalizeSlice(model)));
		await this.createSliceIndexFile(library);
		await this.createSliceComponent(model, directory);
	}

	async updateSlice(model: SharedSliceModel): Promise<void> {
		const slice = await this.getSlice(model.id);
		await writeFileRecursive(slice.modelPath, stringify(canonicalizeSlice(model)));
		await this.createSliceIndexFile(slice.library);
	}

	async deleteSlice(id: string): Promise<void> {
		const slice = await this.getSlice(id);
		await rm(slice.directory, { recursive: true });
		await this.createSliceIndexFile(slice.library);
	}

	async getCustomTypeLibraries(): Promise<URL[]> {
		return [new URL("customtypes/", await findProjectRoot())];
	}

	async getCustomTypes(): Promise<ModelMeta<DynamicCustomTypeModel>[]> {
		return readModels(await this.getCustomTypeLibraries(), "*/index.json");
	}

	async getCustomType(id: string): Promise<ModelMeta<DynamicCustomTypeModel>> {
		const customType = (await this.getCustomTypes()).find((s) => s.model.id === id);
		if (!customType) throw new Error(`No custom type found with ID: ${id}`);
		return customType;
	}

	async createCustomType(model: DynamicCustomTypeModel): Promise<void> {
		const [library] = await this.getCustomTypeLibraries();
		const directory = appendTrailingSlash(new URL(model.id, appendTrailingSlash(library)));
		await assertModelMissing("type", model.id, directory, await this.getCustomTypes());
		await writeFileRecursive(
			new URL("index.json", directory),
			stringify(canonicalizeCustomType(model)),
		);
		if (model.format !== "page") return;
		await addRoute(model);
		const routePath = buildRoutePath(model)
			.split("/")
			.filter(Boolean)
			.map((segment) => (segment.startsWith(":") ? `[${segment.slice(1)}]` : segment))
			.join("/");
		await this.createPageFile(model, routePath);
	}

	async updateCustomType(model: DynamicCustomTypeModel): Promise<void> {
		const customType = await this.getCustomType(model.id);
		await writeFileRecursive(customType.modelPath, stringify(canonicalizeCustomType(model)));
		await updateRoute(model);
	}

	async deleteCustomType(id: string): Promise<void> {
		const customType = await this.getCustomType(id);
		await rm(customType.directory, { recursive: true });
		await removeRoute(id);
	}

	async getModels(): Promise<Models> {
		const [customTypes, slices] = await Promise.all([this.getCustomTypes(), this.getSlices()]);
		return {
			customTypes: customTypes.map((customType) => customType.model),
			slices: slices.map((slice) => slice.model),
		};
	}

	async writeModels(diff: ModelsDiff): Promise<void> {
		for (const model of diff.slices.update) await this.updateSlice(model);
		for (const model of diff.slices.delete) await this.deleteSlice(model.id);
		for (const model of diff.slices.insert) await this.createSlice(model);
		for (const model of diff.customTypes.update) await this.updateCustomType(model);
		for (const model of diff.customTypes.delete) await this.deleteCustomType(model.id);
		for (const model of diff.customTypes.insert) await this.createCustomType(model);
	}

	async generateTypes(): Promise<URL> {
		const output = new URL("prismicio-types.d.ts", await findProjectRoot());
		const types = generateTypes({
			customTypeModels: (await this.getCustomTypes()).map(({ model }) => ({
				...model,
				label: model.label ?? null,
			})),
			sharedSliceModels: (await this.getSlices()).map((slice) => slice.model),
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

	async getEnvironment(): Promise<string | undefined> {
		const envLocalPath = await getEnvLocalPath();
		if (!(await exists(envLocalPath))) return undefined;
		return (await readEnvFile(envLocalPath))[this.environmentEnvVarName] || undefined;
	}

	async setEnvironment(environment: string): Promise<void> {
		await setEnvFileVar(await getEnvLocalPath(), this.environmentEnvVarName, environment);
	}

	async unsetEnvironment(): Promise<void> {
		await unsetEnvFileVar(await getEnvLocalPath(), this.environmentEnvVarName);
	}
}

async function getEnvLocalPath(): Promise<URL> {
	return new URL(".env.local", await findProjectRoot());
}

async function readModels<T extends { id: string }>(
	libraries: URL[],
	pattern: string,
): Promise<ModelMeta<T>[]> {
	const models: ModelMeta<T>[] = [];
	for (const library of libraries) {
		const paths = await glob(pattern, { absolute: true, cwd: library });
		const libraryModels = await Promise.all(
			paths.map(async (path) => {
				const modelPath = pathToFileURL(path);
				const model = await readJsonFile<T>(modelPath);
				return { library, directory: new URL(".", modelPath), modelPath, model };
			}),
		);
		models.push(...libraryModels);
	}
	return models.sort((a, b) => a.model.id.toLowerCase().localeCompare(b.model.id.toLowerCase()));
}
