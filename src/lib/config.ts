import { writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import * as v from "valibot";

import { findUpward } from "./file";
import { stringify } from "./json";

const CONFIG_FILENAME = "prismic.config.json";

const ConfigSchema = v.object({
	repositoryName: v.string(),
	apiEndpoint: v.optional(v.pipe(v.string(), v.url())),
	localSliceMachineSimulatorURL: v.optional(v.pipe(v.string(), v.url())),
	libraries: v.optional(v.array(v.string())),
	adapter: v.optional(v.string()),
	labs: v.optional(
		v.object({
			legacySliceUpgrader: v.optional(v.boolean()),
		}),
	),
});
type Config = v.InferOutput<typeof ConfigSchema>;

export type ConfigResult = SuccessfulConfigResult | FailedConfigResult;
export type SuccessfulConfigResult = { ok: true; config: Config };
export type FailedConfigResult = {
	ok: false;
	error: InvalidPrismicConfig | MissingPrismicConfig;
};
export type UnknownProjectRootConfigResult = {
	ok: false;
	error: UnknownProjectRoot;
};

export async function createConfig(
	config: Config,
	cwd = pathToFileURL(process.cwd()),
): Promise<ConfigResult | UnknownProjectRootConfigResult> {
	const result = await findSuggestedConfigPath(cwd);
	if (!result.ok) return result;
	await writeFile(result.path, stringify(config));
	return { ok: true, config };
}

export async function safeGetRepositoryFromConfig(
	cwd = pathToFileURL(process.cwd()),
): Promise<string | undefined> {
	const result = await readConfig(cwd);
	if (result.ok) return result.config.repositoryName;
}

export async function readConfig(cwd = pathToFileURL(process.cwd())): Promise<ConfigResult> {
	const findResult = await findConfig(cwd);
	if (!findResult.ok) return findResult;

	try {
		const contents = await readFile(findResult.path, "utf8");
		const result = v.safeParse(ConfigSchema, JSON.parse(contents));
		if (!result.success) {
			return { ok: false, error: new InvalidPrismicConfig(result.issues) };
		}
		return { ok: true, config: result.output };
	} catch {
		return { ok: false, error: new InvalidPrismicConfig() };
	}
}

export class InvalidPrismicConfig extends Error {
	issues: v.InferIssue<typeof ConfigSchema>[];

	constructor(issues: v.InferIssue<typeof ConfigSchema>[] = []) {
		super("prismic.config.json is invalid.");
		this.issues = issues;
	}
}

export async function updateConfig(
	config: Partial<Config>,
	cwd = pathToFileURL(process.cwd()),
): Promise<ConfigResult> {
	const findResult = await findConfig(cwd);
	if (!findResult.ok) return findResult;

	const readResult = await readConfig(cwd);
	if (!readResult.ok) return readResult;

	const updatedConfig = { ...readResult.config, ...config };
	await writeFile(findResult.path, stringify(updatedConfig));
	return { ok: true, config: updatedConfig };
}

async function findConfig(cwd = pathToFileURL(process.cwd())) {
	const path = await findUpward(CONFIG_FILENAME, { start: cwd, stop: "package.json" });
	if (!path) return { ok: false, error: new MissingPrismicConfig() } as const;
	return { ok: true, path } as const;
}

async function findSuggestedConfigPath(cwd = pathToFileURL(process.cwd())) {
	const path = await findUpward("package.json", { start: cwd });
	if (!path) return { ok: false, error: new UnknownProjectRoot() } as const;
	return { ok: true, path: new URL(CONFIG_FILENAME, path) } as const;
}

export class MissingPrismicConfig extends Error {
	message = "Could not find a prismic.config.json file.";
}

export class UnknownProjectRoot extends Error {
	message = "Could not find a package.json file.";
}
