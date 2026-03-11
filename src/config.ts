import { readFile, rm, writeFile } from "node:fs/promises";
import * as z from "zod/mini";

import { findUpward } from "./lib/file";
import { stringify } from "./lib/json";
import { findPackageJson, MissingPackageJson } from "./lib/packageJson";

const CONFIG_FILENAME = "prismic.config.json";
const LEGACY_SLICE_MACHINE_CONFIG_FILENAME = "slicemachine.config.json";

const ConfigSchema = z.object({
	repositoryName: z.string(),
	libraries: z.optional(z.array(z.string())),
});
export type Config = z.infer<typeof ConfigSchema>;

const LegacySliceMachineConfigSchema = z.object({
	repositoryName: z.string(),
	libraries: z.optional(z.array(z.string())),
});
export type LegacySliceMachineConfig = z.infer<typeof LegacySliceMachineConfigSchema>;

export async function createConfig(config: Config): Promise<URL> {
	const suggestedConfigPath = await findSuggestedConfigPath();
	await writeFile(suggestedConfigPath, stringify(config));
	return suggestedConfigPath;
}

export async function safeGetRepositoryFromConfig(): Promise<string | undefined> {
	try {
		const config = await readConfig();
		return config.repositoryName;
	} catch {
		return undefined;
	}
}

export async function readConfig(): Promise<Config> {
	const configPath = await findConfigPath();
	try {
		const raw = await readFile(configPath, "utf8");
		const config = z.parse(ConfigSchema, JSON.parse(raw));
		return config;
	} catch (error) {
		if (error instanceof z.core.$ZodError) {
			throw new InvalidPrismicConfig(error.issues);
		}
		throw new InvalidPrismicConfig();
	}
}

export class InvalidPrismicConfig extends Error {
	name = "InvalidPrismicConfig";
	message = `${CONFIG_FILENAME}.config.json is invalid.`;
	issues: z.core.$ZodIssue[];

	constructor(issues: z.core.$ZodIssue[] = []) {
		super();
		this.issues = issues;
	}
}

export async function updateConfig(updates: Partial<Config>): Promise<Config> {
	const configPath = await findConfigPath();
	const config = await readConfig();
	const updatedConfig = { ...config, ...updates };
	await writeFile(configPath, stringify(updatedConfig));
	return updatedConfig;
}

async function findConfigPath(): Promise<URL> {
	const configPath = await findUpward(CONFIG_FILENAME, { stop: "package.json" });
	if (!configPath) throw new MissingPrismicConfig();
	return configPath;
}

export class MissingPrismicConfig extends Error {
	name = "MissingPrismicConfig";
	message = `Could not find a ${CONFIG_FILENAME} file.`;
}

async function findSuggestedConfigPath() {
	try {
		const packageJsonPath = await findPackageJson();
		const suggestedConfigPath = new URL(CONFIG_FILENAME, packageJsonPath);
		return suggestedConfigPath;
	} catch (error) {
		if (error instanceof MissingPackageJson) {
			throw new UnknownProjectRoot(undefined, { cause: error });
		}
		throw error;
	}
}

export class UnknownProjectRoot extends Error {
	name = "UnknownProjectRoot";
}

export async function readLegacySliceMachineConfig(): Promise<LegacySliceMachineConfig> {
	const configPath = await findLegacySliceMachineConfigPath();
	try {
		const raw = await readFile(configPath, "utf8");
		const config = z.parse(LegacySliceMachineConfigSchema, JSON.parse(raw));
		return config;
	} catch (error) {
		if (error instanceof z.core.$ZodError) {
			throw new InvalidLegacySliceMachineConfig(error.issues);
		}
		throw new InvalidLegacySliceMachineConfig();
	}
}

export class InvalidLegacySliceMachineConfig extends Error {
	name = "InvalidLegacySliceMachineConfig";
	message = `${LEGACY_SLICE_MACHINE_CONFIG_FILENAME} is invalid.`;
	issues: z.core.$ZodIssue[];

	constructor(issues: z.core.$ZodIssue[] = []) {
		super();
		this.issues = issues;
	}
}

export async function deleteLegacySliceMachineConfig(): Promise<void> {
	const configPath = await findLegacySliceMachineConfigPath();
	await rm(configPath);
}

async function findLegacySliceMachineConfigPath(): Promise<URL> {
	const configPath = await findUpward(LEGACY_SLICE_MACHINE_CONFIG_FILENAME, {
		stop: "package.json",
	});
	if (!configPath) throw new MissingLegacySliceMachineConfig();
	return configPath;
}

export class MissingLegacySliceMachineConfig extends Error {
	name = "MissingLegacySliceMachineConfig";
	message = `Could not find a ${LEGACY_SLICE_MACHINE_CONFIG_FILENAME} file.`;
}
