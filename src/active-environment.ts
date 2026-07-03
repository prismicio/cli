import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { getConfigDir } from "./lib/config-dir";
import { stringify } from "./lib/json";

// The active environment lives in the CLI, keyed by project so nothing lands in
// the repo. Reads are synchronous so a framework config can set the environment
// variable before the framework reads it at build time. This module is published
// as `prismic/env`, so it stays dependency-light.

const CONFIG_FILENAME = "prismic.config.json";

const ENVIRONMENTS_PATH = new URL(
	"environments.json",
	getConfigDir("prismic", process.env.PRISMIC_CONFIG_DIR),
);

const FRAMEWORK_ENV_VARS: Record<string, string> = {
	next: "NEXT_PUBLIC_PRISMIC_ENVIRONMENT",
	nuxt: "NUXT_PUBLIC_PRISMIC_ENVIRONMENT",
	"@sveltejs/kit": "VITE_PRISMIC_ENVIRONMENT",
};

export function getActiveEnvironment(): string | undefined {
	const project = findProjectRoot();
	if (!project) return undefined;
	return readState()[project];
}

export function setActiveEnvironment(domain: string): void {
	const project = findProjectRoot();
	if (!project) return;
	const state = readState();
	state[project] = domain;
	writeState(state);
}

export function unsetActiveEnvironment(): void {
	const project = findProjectRoot();
	if (!project) return;
	const state = readState();
	if (!(project in state)) return;
	delete state[project];
	writeState(state);
}

export function getFrameworkEnvVar(): string | undefined {
	const packageJson = readPackageJson();
	if (!packageJson) return undefined;
	const dependencies = {
		...packageJson.dependencies,
		...packageJson.devDependencies,
		...packageJson.peerDependencies,
	};
	for (const dependency in FRAMEWORK_ENV_VARS) {
		if (dependency in dependencies) return FRAMEWORK_ENV_VARS[dependency];
	}
	return undefined;
}

function readState(): Record<string, string> {
	try {
		return JSON.parse(readFileSync(ENVIRONMENTS_PATH, "utf8"));
	} catch {
		return {};
	}
}

function writeState(state: Record<string, string>): void {
	mkdirSync(new URL(".", ENVIRONMENTS_PATH), { recursive: true });
	writeFileSync(ENVIRONMENTS_PATH, stringify(state));
}

function findProjectRoot(): string | undefined {
	return findUpward(CONFIG_FILENAME, (dir) => realpathSync(dir));
}

type PackageJson = {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
};

function readPackageJson(): PackageJson | undefined {
	return findUpward("package.json", (dir) =>
		JSON.parse(readFileSync(join(dir, "package.json"), "utf8")),
	);
}

function findUpward<T>(filename: string, onFound: (dir: string) => T): T | undefined {
	let dir = process.cwd();
	while (true) {
		if (existsSync(join(dir, filename))) return onFound(dir);
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}
