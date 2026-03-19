import {
	findConfigPath,
	findSuggestedConfigPath,
	MissingPrismicConfig,
	readConfig,
} from "./config";
import { exists } from "./lib/file";
import { appendTrailingSlash } from "./lib/url";

export async function findProjectRoot(): Promise<URL> {
	let configPath;
	try {
		configPath = await findConfigPath();
	} catch (error) {
		if (error instanceof MissingPrismicConfig) {
			configPath = await findSuggestedConfigPath();
		} else {
			throw error;
		}
	}
	const projectRoot = new URL(".", configPath);
	return projectRoot;
}

export async function safeGetRepositoryName(): Promise<string | undefined> {
	try {
		return await getRepositoryName();
	} catch {
		return undefined;
	}
}

export async function getRepositoryName(): Promise<string> {
	const config = await readConfig();
	return config.repositoryName;
}

export async function getLibraries(): Promise<URL[] | undefined> {
	const config = await readConfig();
	const rawLibraries = config.libraries;
	if (!rawLibraries || rawLibraries.length < 1) return;
	const projectRoot = await findProjectRoot();
	const libraries = rawLibraries.map((library) =>
		appendTrailingSlash(new URL(library.replace(/^\//, ""), projectRoot)),
	);
	return libraries;
}

export async function checkIsTypeScriptProject(): Promise<boolean> {
	const projectRoot = await findProjectRoot();
	const tsconfigPath = new URL("tsconfig.json", projectRoot);
	const isTypeScriptProject = await exists(tsconfigPath);
	return isTypeScriptProject;
}
