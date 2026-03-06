import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { pascalCase } from "change-case";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { glob } from "tinyglobby";

import { readConfig } from "./config";
import { exists, findUpward } from "./file";
import { stringify } from "./json";
import { addDependencies, getNpmPackageVersion } from "./packageJson";
import { dedent } from "./string";
import { appendTrailingSlash } from "./url";

export async function initProject(): Promise<void> {
	await addDependencies({
		"@prismicio/client": `^${await getNpmPackageVersion("@prismicio/client")}`,
		"@prismicio/react": `^${await getNpmPackageVersion("@prismicio/react")}`,
		"@prismicio/next": `^${await getNpmPackageVersion("@prismicio/next")}`,
	});
	const libraries = await getSliceLibraries();
	for (const library of libraries) {
		await updateSliceLibraryIndexFile(library);
	}
	// TODO:
	// createPrismicIOFile(),
	// createSliceSimulatorPage(),
	// createPreviewRoute(),
	// createExitPreviewRoute(),
	// createRevalidateRoute(),
}

export async function createSlice(
	model: SharedSlice,
	library: URL,
): Promise<{ modelPath: URL; componentPath: URL; indexPath: URL }> {
	const { modelPath } = await writeSliceModel(model, library);
	const { componentPath } = await createSliceComponent(model, library);
	const { indexPath } = await updateSliceLibraryIndexFile(library);
	return { modelPath, componentPath, indexPath };
}

async function createSliceComponent(
	model: SharedSlice,
	library: URL,
): Promise<{ componentPath: URL }> {
	const sliceDirectory = await getSliceDirectory(model.name, library);
	const extension = await getJsFileExtension();
	const filename = `index.${extension}x`;
	const componentPath = new URL(filename, sliceDirectory);

	const isTypeScriptProject = await checkIsTypeScriptProject();
	const pascalName = pascalCase(model.name);

	const returnStatement = dedent`
		return (
			<section
				data-slice-type={slice.slice_type}
				data-slice-variation={slice.variation}
			>
				Placeholder component for ${model.id} (variation: {slice.variation}) slices.
				<br />
				<strong>You can edit this slice directly in your code editor.</strong>
			</section>
		)
	`;

	const contents = isTypeScriptProject
		? dedent`
			import { FC } from "react";
			import { Content } from "@prismicio/client";
			import { SliceComponentProps } from "@prismicio/react";

			/**
			 * Props for \`${pascalName}\`.
			 */
			export type ${pascalName}Props = SliceComponentProps<Content.${pascalName}Slice>;

			/**
			 * Component for "${model.name}" Slices.
			 */
			const ${pascalName}: FC<${pascalName}Props> = ({ slice }) => {
				${returnStatement}
			};

			export default ${pascalName}
		`
		: dedent`
			/**
			 * @typedef {import("@prismicio/client").Content.${pascalName}Slice} ${pascalName}Slice
			 * @typedef {import("@prismicio/react").SliceComponentProps<${pascalName}Slice>} ${pascalName}Props
			 * @type {import("react").FC<${pascalName}Props>}
			 */
			const ${pascalName} = ({ slice }) => {
				${returnStatement}
			};

			export default ${pascalName};
		`;

	await writeFile(componentPath, contents);
	return { componentPath };
}

async function getJsFileExtension() {
	const isTypeScriptProject = await checkIsTypeScriptProject();
	const jsFileExtension = isTypeScriptProject ? "ts" : "js";
	return jsFileExtension;
}

async function checkIsTypeScriptProject() {
	const projectRoot = await getProjectRoot();
	const tsconfigPath = new URL("tsconfig.json", projectRoot);
	const isTypeScriptProject = await exists(tsconfigPath);
	return isTypeScriptProject;
}

export async function readSlice(sliceId: string): Promise<SharedSlice> {
	const slice = await findSlice(sliceId);
	return slice.model;
}

export async function updateSlice(
	model: SharedSlice,
): Promise<{ modelPath: URL; indexPath: URL }> {
	const existingSlice = await findSlice(model.id);
	const { modelPath } = await writeSliceModel(model, existingSlice.library);
	const { indexPath } = await updateSliceLibraryIndexFile(
		existingSlice.library,
	);
	return { modelPath, indexPath };
}

export async function renameSlice(
	model: SharedSlice,
): Promise<{ modelPath: URL; indexPath: URL }> {
	const existingSlice = await findSlice(model.id);
	const newSliceDirectory = await getSliceDirectory(
		model.name,
		existingSlice.library,
	);
	await rename(existingSlice.directory, newSliceDirectory);
	const { modelPath } = await writeSliceModel(model, existingSlice.library);
	const { indexPath } = await updateSliceLibraryIndexFile(
		existingSlice.library,
	);
	return { modelPath, indexPath };
}

export async function deleteSlice(
	sliceId: string,
): Promise<{ sliceDirectory: URL; indexPath: URL }> {
	const slice = await findSlice(sliceId);
	await rm(slice.directory, { recursive: true });
	const { indexPath } = await updateSliceLibraryIndexFile(slice.library);
	return { sliceDirectory: slice.directory, indexPath };
}

async function updateSliceLibraryIndexFile(
	library: URL,
): Promise<{ indexPath: URL }> {
	const slices = await getSlices(library);
	const imports = slices.map((slice) => {
		const componentName = pascalCase(slice.model.name);
		const relativeDirectory = relative(
			fileURLToPath(slice.library),
			fileURLToPath(slice.directory),
		);
		return `import ${componentName} from "./${relativeDirectory}";`;
	});
	const componentLines = slices.map((slice) => {
		const componentName = pascalCase(slice.model.name);
		return `${slice.model.id}: ${componentName}`;
	});
	const contents = dedent`
		// Code generated by Prismic. DO NOT EDIT.

		${imports.join("\n")}

		export const components = {
			${componentLines.join(",\n")}
		};
	`;
	const extension = await getJsFileExtension();
	const filename = `index.${extension}`;
	const indexPath = new URL(filename, library);
	await writeFile(indexPath, contents);
	return { indexPath };
}

async function findSlice(
	sliceId: string,
): Promise<{ library: URL; directory: URL; model: SharedSlice }> {
	const slices = await getSlices();
	const slice = slices.find((slice) => slice.model.id === sliceId);
	if (!slice) throw new Error(`No slice found with ID: ${sliceId}`);
	return slice;
}

export async function getSlices(
	library?: URL,
): Promise<{ library: URL; directory: URL; model: SharedSlice }[]> {
	const libraryDirs = library ? [library] : await getSliceLibraries();
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

async function writeSliceModel(
	model: SharedSlice,
	library: URL,
): Promise<{ modelPath: URL }> {
	const sliceDirectory = await getSliceDirectory(model.name, library);
	await mkdir(sliceDirectory, { recursive: true });
	const modelPath = new URL("model.json", sliceDirectory);
	const formattedModel = formatModel(model);
	await writeFile(modelPath, formattedModel);
	return { modelPath };
}

async function getSliceDirectory(
	sliceName: string,
	library: URL,
): Promise<URL> {
	const sliceDirectoryName = pascalCase(sliceName);
	const sliceDirectory = appendTrailingSlash(
		new URL(sliceDirectoryName, library),
	);
	return sliceDirectory;
}

async function getSliceLibraries(): Promise<URL[]> {
	const projectRoot = await getProjectRoot();
	const configResult = await readConfig();
	const sliceLibraries = configResult.ok
		? configResult.config.libraries
		: undefined;

	if (sliceLibraries?.length) {
		return sliceLibraries.map((sliceLibrary) => {
			const withoutLeadingSlash = sliceLibrary.replace(/^\//, "");
			return appendTrailingSlash(new URL(withoutLeadingSlash, projectRoot));
		});
	}

	const sourceFilesRoot = await getSourceFilesRoot();
	const defaultSliceLibrary = new URL("slices/", sourceFilesRoot);
	return [defaultSliceLibrary];
}

export async function getDefaultSliceLibrary(): Promise<URL> {
	const dirs = await getSliceLibraries();
	return dirs[0];
}

export async function createCustomType(
	model: CustomType,
): Promise<{ modelPath: URL }> {
	const { modelPath } = await writeCustomType(model);
	return { modelPath };
}

export async function readCustomType(
	customTypeId: string,
): Promise<CustomType> {
	const customTypeDirectory = await getCustomTypeDirectory(customTypeId);
	const modelPath = new URL("index.json", customTypeDirectory);
	const model = await readFile(modelPath, "utf8");
	const json = JSON.parse(model);
	return json;
}

export async function updateCustomType(
	model: CustomType,
): Promise<{ modelPath: URL }> {
	const { modelPath } = await writeCustomType(model);
	return { modelPath };
}

export async function renameCustomType(
	model: CustomType,
): Promise<{ modelPath: URL }> {
	const existingCustomTypeDirectory = await getCustomTypeDirectory(model.id);
	const newCustomTypeDirectory = await getCustomTypeDirectory(model.id);
	await rename(existingCustomTypeDirectory, newCustomTypeDirectory);
	const { modelPath } = await writeCustomType(model);
	return { modelPath };
}

export async function deleteCustomType(
	customTypeId: string,
): Promise<{ customTypeDirectory: URL }> {
	const customTypeDirectory = await getCustomTypeDirectory(customTypeId);
	await rm(customTypeDirectory, { recursive: true });
	return { customTypeDirectory };
}

export async function getCustomTypes(): Promise<
	{ directory: URL; model: CustomType }[]
> {
	const customTypesDirectory = await getCustomTypesDirectory();
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

async function writeCustomType(
	model: CustomType,
): Promise<{ modelPath: URL }> {
	const customTypeDirectory = await getCustomTypeDirectory(model.id);
	await mkdir(customTypeDirectory, { recursive: true });
	const modelPath = new URL("index.json", customTypeDirectory);
	const formattedModel = formatModel(model);
	await writeFile(modelPath, formattedModel);
	return { modelPath };
}

async function getCustomTypeDirectory(customTypeId: string) {
	const customTypesDirectory = await getCustomTypesDirectory();
	const customTypeDirectoryName = customTypeId;
	const customTypeDirectory = appendTrailingSlash(
		new URL(customTypeDirectoryName, customTypesDirectory),
	);
	return customTypeDirectory;
}

async function getCustomTypesDirectory() {
	const projectRoot = await getProjectRoot();
	const customTypesDirectory = new URL(`customtypes/`, projectRoot);
	return customTypesDirectory;
}

function formatModel(model: CustomType | SharedSlice): string {
	const formattedModel = stringify(model);
	return formattedModel;
}

async function getSourceFilesRoot() {
	const projectRoot = await getProjectRoot();
	const srcDirectory = new URL("src/", projectRoot);
	const hasSrcDirectory = await exists(srcDirectory);
	const sourceFilesDirectory = hasSrcDirectory ? srcDirectory : projectRoot;
	return sourceFilesDirectory;
}

async function getProjectRoot() {
	const packageJsonPath = await findUpward("package.json");
	if (!packageJsonPath) {
		throw new Error("No package.json found");
	}
	const projectRoot = new URL("./", packageJsonPath);
	return projectRoot;
}
