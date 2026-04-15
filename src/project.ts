import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { readFile, rm, writeFile } from "node:fs/promises";
import * as z from "zod/mini";

import { getRepository } from "./clients/repository";
import { getProfile } from "./clients/user";
import { env } from "./env";
import { evaluateFlag } from "./lib/amplitude";
import { exists, findUpward } from "./lib/file";
import { stringify } from "./lib/json";
import { findPackageJson, MissingPackageJson } from "./lib/packageJson";
import { appendTrailingSlash } from "./lib/url";

// ── prismic.config.json ─────────────────────────────────────────────

const CONFIG_FILENAME = "prismic.config.json";

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
	documentAPIEndpoint: z.optional(z.url()),
	libraries: z.optional(z.array(z.string())),
	routes: z.optional(z.array(RouteSchema)),
});
export type Config = z.infer<typeof ConfigSchema>;

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

// ── Routes ──────────────────────────────────────────────────────────

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

export function buildRoutePath(pageType: CustomType): string {
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

// ── Legacy Slice Machine config ─────────────────────────────────────

const LEGACY_SLICE_MACHINE_CONFIG_FILENAME = "slicemachine.config.json";

const LegacySliceMachineConfigSchema = z.object({
	repositoryName: z.string(),
	libraries: z.optional(z.array(z.string())),
});
export type LegacySliceMachineConfig = z.infer<typeof LegacySliceMachineConfigSchema>;

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

export async function findLegacySliceMachineConfigPath(): Promise<URL> {
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

// ── Project queries ─────────────────────────────────────────────────

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
