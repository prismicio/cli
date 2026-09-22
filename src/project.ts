import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { realpath, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as z from "zod/mini";

import { env } from "./env";
import { exists, findUpward, readJsonFile } from "./lib/file";
import { stringify } from "./lib/json";
import { findPackageJson, MissingPackageJson } from "./lib/packageJson";
import { getRepository } from "./lib/prismic/clients/repository";
import { dedent } from "./lib/string";
import { appendTrailingSlash } from "./lib/url";

const CONFIG_FILENAME = "prismic.config.json";
const LEGACY_SLICE_MACHINE_CONFIG_FILENAME = "slicemachine.config.json";

const ConfigSchema = z.object({
	repositoryName: z.string(),
	documentAPIEndpoint: z.optional(z.url()),
	libraries: z.optional(z.array(z.string())),
	routes: z.optional(
		z.array(
			z.object({
				type: z.string(),
				path: z.string(),
				uid: z.optional(z.string()),
				lang: z.optional(z.string()),
				resolvers: z.optional(z.record(z.string(), z.string())),
			}),
		),
	),
});
export type Config = z.infer<typeof ConfigSchema>;

const LegacySliceMachineConfigSchema = z.object({
	repositoryName: z.string(),
	libraries: z.optional(z.array(z.string())),
});

export class MissingPrismicConfigError extends Error {
	name = "MissingPrismicConfigError";
	message = `Could not find a ${CONFIG_FILENAME} file. Run \`prismic init\` to create a config.`;
}

export class InvalidPrismicConfigError extends Error {
	name = "InvalidPrismicConfigError";
	message = `${CONFIG_FILENAME} is invalid. Run \`prismic init\` to re-create a config.`;
}

class MissingLegacySliceMachineConfigError extends Error {
	name = "MissingLegacySliceMachineConfigError";
	message = `Could not find a ${LEGACY_SLICE_MACHINE_CONFIG_FILENAME} file.`;
}

export class InvalidLegacySliceMachineConfigError extends Error {
	name = "InvalidLegacySliceMachineConfigError";
	message = `${LEGACY_SLICE_MACHINE_CONFIG_FILENAME} is invalid.`;
}

export class UnknownProjectRootError extends Error {
	name = "UnknownProjectRootError";
	constructor(options?: ErrorOptions) {
		super("Could not find your project root.", options);
	}
}

export class TypeBuilderRequiredError extends Error {
	name = "TypeBuilderRequired";
	constructor(repo: string) {
		super(dedent`
			This command requires the Type Builder, but repository "${repo}" uses the Legacy Builder.

			Contact Prismic support to enable the Type Builder: https://prismic.io/docs/help-center

			Learn more at https://prismic.io/docs/type-builder
		`);
	}
}

export async function createConfig(config: Config): Promise<URL> {
	const configPath = await findSuggestedConfigPath();
	await writeFile(configPath, stringify(config));
	return configPath;
}

export async function readConfig(): Promise<Config> {
	return readJsonFile(await findConfigPath(), { schema: ConfigSchema }).catch(() => {
		throw new InvalidPrismicConfigError();
	});
}

export async function updateConfig(updates: Partial<Config>): Promise<Config> {
	const configPath = await findConfigPath();
	const config = { ...(await readConfig()), ...updates };
	await writeFile(configPath, stringify(config));
	return config;
}

async function findConfigPath(): Promise<URL> {
	const configPath = await findUpward(CONFIG_FILENAME, { stop: "package.json" });
	if (!configPath) throw new MissingPrismicConfigError();
	return configPath;
}

async function findSuggestedConfigPath(): Promise<URL> {
	try {
		return new URL(CONFIG_FILENAME, await findPackageJson());
	} catch (error) {
		if (error instanceof MissingPackageJson) throw new UnknownProjectRootError({ cause: error });
		throw error;
	}
}

export async function addRoute(pageType: CustomType): Promise<void> {
	const { routes = [] } = await readConfig();
	if (routes.some((r) => r.type === pageType.id)) return;
	const newRoutes = [...routes, { type: pageType.id, path: buildRoutePath(pageType) }];
	await updateConfig({ routes: newRoutes.sort((a, b) => a.type.localeCompare(b.type)) });
}

export async function updateRoute(pageType: CustomType): Promise<void> {
	if (pageType.format === "page") {
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
	if (repeatable) return id === "page" ? "/:uid" : `/${namespace}/:uid`;
	return id === "homepage" ? "/" : `/${namespace}`;
}

export async function readLegacySliceMachineConfig(): Promise<
	z.infer<typeof LegacySliceMachineConfigSchema>
> {
	const configPath = await findLegacySliceMachineConfigPath();
	return readJsonFile(configPath, { schema: LegacySliceMachineConfigSchema }).catch(() => {
		throw new InvalidLegacySliceMachineConfigError();
	});
}

export async function deleteLegacySliceMachineConfig(): Promise<void> {
	await rm(await findLegacySliceMachineConfigPath());
}

async function findLegacySliceMachineConfigPath(): Promise<URL> {
	const configPath = await findUpward(LEGACY_SLICE_MACHINE_CONFIG_FILENAME, {
		stop: "package.json",
	});
	if (!configPath) throw new MissingLegacySliceMachineConfigError();
	return configPath;
}

export async function findProjectRoot(): Promise<URL> {
	let configPath;
	try {
		configPath = await findConfigPath();
	} catch (error) {
		if (!(error instanceof MissingPrismicConfigError)) throw error;
		configPath = await findSuggestedConfigPath();
	}
	const projectRoot = await realpath(fileURLToPath(new URL(".", configPath)));
	return appendTrailingSlash(pathToFileURL(projectRoot));
}

export async function getRepositoryName(): Promise<string> {
	try {
		return (await readConfig()).repositoryName;
	} catch (error) {
		if (error instanceof MissingPrismicConfigError) {
			try {
				return (await readLegacySliceMachineConfig()).repositoryName;
			} catch {}
		}
		throw error;
	}
}

export async function getLibraries(): Promise<URL[] | undefined> {
	const { libraries } = await readConfig();
	if (!libraries?.length) return;
	const projectRoot = await findProjectRoot();
	return libraries.map((library) =>
		appendTrailingSlash(new URL(library.replace(/^\//, ""), projectRoot)),
	);
}

export async function checkIsTypeScriptProject(): Promise<boolean> {
	return exists(new URL("tsconfig.json", await findProjectRoot()));
}

export async function checkIsTypeBuilderEnabled(
	repo: string,
	config: { token: string | undefined; host: string },
): Promise<boolean> {
	if (env.PRISMIC_TYPE_BUILDER_ENABLED !== undefined) return env.PRISMIC_TYPE_BUILDER_ENABLED;
	const repository = await getRepository({ repo, ...config });
	return repository.quotas?.sliceMachineEnabled === true;
}
