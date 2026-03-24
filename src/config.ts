import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { readFile, rm, writeFile } from "node:fs/promises";
import * as z from "zod/mini";

import { findUpward } from "./lib/file";
import { stringify } from "./lib/json";
import { findPackageJson, MissingPackageJson } from "./lib/packageJson";

const CONFIG_FILENAME = "prismic.config.json";
const LEGACY_SLICE_MACHINE_CONFIG_FILENAME = "slicemachine.config.json";

const RouteSchema = z.object({
	type: z.string(),
	path: z.string(),
	uid: z.optional(z.string()),
	lang: z.optional(z.string()),
	resolvers: z.optional(z.record(z.string(), z.string())),
});
export type Route = z.infer<typeof RouteSchema>;

const ConfigSchema = z.object({
	repositoryName: z.string(),
	libraries: z.optional(z.array(z.string())),
	routes: z.optional(z.array(RouteSchema)),
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
	message = `${CONFIG_FILENAME} is invalid.`;
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

export async function findConfigPath(): Promise<URL> {
	const configPath = await findUpward(CONFIG_FILENAME, { stop: "package.json" });
	if (!configPath) throw new MissingPrismicConfig();
	return configPath;
}

export class MissingPrismicConfig extends Error {
	name = "MissingPrismicConfig";
	message = `Could not find a ${CONFIG_FILENAME} file.`;
}

export async function findSuggestedConfigPath(): Promise<URL> {
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

export async function addRoute(pageType: CustomType): Promise<void> {
	const { routes = [] } = await readConfig();
	const hasRoute = routes.some((r) => r.type === pageType.id);
	if (hasRoute) return;
	const path = buildRoutePath(pageType);
	const newRoute: Route = { type: pageType.id, path };
	const newRoutes = [...routes, newRoute].sort((a, b) => a.type.localeCompare(b.type));
	await updateConfig({ routes: newRoutes });
}

export async function updateRoute(pageType: CustomType): Promise<void> {
	if (pageType.format === "page") {
		const { routes = [] } = await readConfig();
		const hasRoute = routes.some((r) => r.type === pageType.id);
		if (hasRoute) return;
		await addRoute(pageType);
	} else {
		await removeRoute(pageType.id);
	}
}

export async function removeRoute(id: string): Promise<void> {
	const { routes = [] } = await readConfig();
	const newRoutes = routes.filter((r) => r.type !== id);
	if (routes.length === newRoutes.length) return;
	await updateConfig({ routes: newRoutes });
}

function buildRoutePath(pageType: CustomType): string {
	const { id, repeatable } = pageType;
	const namespace = id.replaceAll("_", "-").toLowerCase();
	if (repeatable) {
		if (id === "page") return "/:uid";
		return `/${namespace}/:uid`;
	} else {
		if (id === "homepage") return "/";
		return `/${namespace}`;
	}
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
