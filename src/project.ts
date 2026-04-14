import { getRepository } from "./clients/repository";
import { getProfile } from "./clients/user";
import {
	findConfigPath,
	findSuggestedConfigPath,
	MissingPrismicConfig,
	readConfig,
	readLegacySliceMachineConfig,
} from "./config";
import { env } from "./env";
import { evaluateFlag } from "./lib/amplitude";
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
	try {
		const config = await readConfig();
		return config.repositoryName;
	} catch (error) {
		if (error instanceof MissingPrismicConfig) {
			try {
				const legacySliceMachineConfig = await readLegacySliceMachineConfig();
				return legacySliceMachineConfig.repositoryName;
			} catch {}
		}
		throw error;
	}
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

export async function checkIsTypeBuilderEnabled(
	repo: string,
	config: { token: string | undefined; host: string },
): Promise<boolean> {
	if (env.PRISMIC_TYPE_BUILDER_ENABLED !== undefined) return env.PRISMIC_TYPE_BUILDER_ENABLED;

	const { token, host } = config;
	const profile = await getProfile({ token, host });
	const [flagEnabled, repository] = await Promise.all([
		evaluateFlag("dev-tools-types-builder-cloud", {
			userId: profile.shortId,
			groups: { Repository: [repo] },
		}),
		getRepository({ repo, token, host }),
	]);
	return flagEnabled && repository.quotas?.sliceMachineEnabled === true;
}

export class TypeBuilderRequiredError extends Error {
	name = "TypeBuilderRequired";
}
