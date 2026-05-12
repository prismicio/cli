import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";
import type { Result } from "tinyexec";

import { pascalCase } from "change-case";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { x } from "tinyexec";
import { inject, test } from "vitest";

const BIN = fileURLToPath(new URL("../dist/index.mjs", import.meta.url));

const E2E_PRISMIC_EMAIL = process.env.E2E_PRISMIC_EMAIL!;
const DEFUALT_PRISMIC_HOST = "prismic.io";

export type Fixtures = {
	host: string;
	home: URL;
	project: URL;
	prismic: typeof x;
	login: () => Promise<{ token: string; email: string }>;
	logout: () => Promise<void>;
	token: string;
	password: string;
	repo: string;
};

export const it = test.extend<Fixtures>({
	// oxlint-disable-next-line no-empty-pattern
	host: async ({}, use) => {
		await use(process.env.PRISMIC_HOST ?? DEFUALT_PRISMIC_HOST);
	},
	// oxlint-disable-next-line no-empty-pattern
	home: async ({}, use) => {
		const dir = await mkdtemp(join(tmpdir(), "prismic-test-"));
		await use(pathToFileURL(dir + "/"));
		try {
			await rm(dir, { recursive: true, force: true });
		} catch {
			// Retry once with delay
			await new Promise((res) => setTimeout(res, 1000));
			await rm(dir, { recursive: true, force: true });
		}
	},
	project: async ({ home, repo }, use) => {
		const projectPath = new URL("project/", home);
		await mkdir(projectPath, { recursive: true });

		// Stub npm
		const binDir = new URL("bin/", home);
		await mkdir(binDir);
		const lockfilePath = fileURLToPath(new URL("package-lock.json", projectPath));
		await writeFile(
			new URL("npm", binDir),
			`#!/bin/sh\necho '{}' > "${lockfilePath}"\necho "added 0 packages"\n`,
			{ mode: 0o755 },
		);

		// Stub Next.js installation
		const packageJsonPath = new URL("package.json", projectPath);
		await writeFile(packageJsonPath, JSON.stringify({ dependencies: { next: "latest" } }));
		const nextPackageJsonPath = new URL("node_modules/next/package.json", projectPath);
		await mkdir(new URL(".", nextPackageJsonPath), { recursive: true });
		await writeFile(nextPackageJsonPath, JSON.stringify({ version: "16.0.0" }));
		await mkdir(new URL("app/", projectPath));

		await writeFile(
			new URL("prismic.config.json", projectPath),
			JSON.stringify({ repositoryName: repo }),
		);

		await use(projectPath);
	},
	// oxlint-disable-next-line no-empty-pattern
	token: async ({}, use) => {
		await use(inject("token"));
	},
	login: async ({ token, home }, use) => {
		await use(async () => {
			const configDir = new URL(".config/prismic/", home);
			await mkdir(configDir, { recursive: true });
			await writeFile(
				new URL("credentials.json", configDir),
				JSON.stringify({ token, host: DEFUALT_PRISMIC_HOST }),
			);
			return { token, email: E2E_PRISMIC_EMAIL };
		});
	},
	logout: async ({ home }, use) => {
		await use(async () => {
			await rm(new URL(".config/prismic/credentials.json", home), { force: true });
		});
	},
	prismic: async ({ home, project, login }, use) => {
		await login();
		const binDir = new URL("bin/", home);
		const configDir = new URL(".config/prismic/", home);
		const procs: Result[] = [];
		await use((command, args = [], options) => {
			const env = {
				...process.env,
				PRISMIC_TYPE_BUILDER_ENABLED: "true",
				NO_UPDATE_NOTIFIER: "1",
				PRISMIC_CONFIG_DIR: fileURLToPath(configDir),
				...options?.nodeOptions?.env,
				PATH: `${fileURLToPath(binDir)}:${process.env.PATH}`,
				HOME: fileURLToPath(home),
			};
			const proc = x("node", [BIN, command, ...args].filter(Boolean), {
				...options,
				nodeOptions: {
					cwd: fileURLToPath(project),
					...options?.nodeOptions,
					env,
				},
			});
			procs.push(proc);
			return proc;
		});
		for (const proc of procs) {
			if (proc.exitCode === undefined) proc.kill();
		}
	},
	// oxlint-disable-next-line no-empty-pattern
	password: async ({}, use) => {
		await use(process.env.E2E_PRISMIC_PASSWORD!);
	},
	// oxlint-disable-next-line no-empty-pattern
	repo: async ({}, use) => {
		await use(inject("repo"));
	},
});

export function captureOutput(proc: Result): () => string {
	let output = "";
	proc.process?.stdout?.on("data", (c: Buffer) => (output += c.toString()));
	proc.process?.stderr?.on("data", (c: Buffer) => (output += c.toString()));
	return () => output;
}

export function buildCustomType(overrides?: Partial<CustomType>): CustomType {
	const id = crypto.randomUUID().split("-")[0];
	return {
		id: `type-T${id}`,
		label: `TypeT${id}`,
		repeatable: true,
		status: true,
		json: { Main: {} },
		...overrides,
	};
}

export function buildSlice(overrides?: Partial<SharedSlice>): SharedSlice {
	const id = crypto.randomUUID().split("-")[0];
	return {
		id: `slice-S${id}`,
		type: "SharedSlice",
		name: `SliceS${id}`,
		variations: [
			{
				id: "default",
				name: "Default",
				docURL: "",
				version: "initial",
				description: "Default",
				imageUrl: "",
				primary: {},
			},
		],
		...overrides,
	};
}

export async function writeLocalCustomType(project: URL, model: CustomType): Promise<void> {
	const path = new URL(`customtypes/${model.id}/index.json`, project);
	await mkdir(new URL(".", path), { recursive: true });
	await writeFile(path, JSON.stringify(model, null, 2));
}

export async function readLocalCustomType(project: URL, id: string): Promise<CustomType> {
	const path = new URL(`customtypes/${id}/index.json`, project);
	return JSON.parse(await readFile(path, "utf8"));
}

export async function readLocalCustomTypes(project: URL): Promise<CustomType[]> {
	const dir = new URL("customtypes/", project);
	const entries = await readdir(dir).catch(() => [] as string[]);
	const result: CustomType[] = [];
	for (const id of entries) {
		try {
			result.push(JSON.parse(await readFile(new URL(`${id}/index.json`, dir), "utf8")));
		} catch {}
	}
	return result;
}

export async function writeLocalSlice(project: URL, model: SharedSlice): Promise<void> {
	const path = new URL(`slices/${pascalCase(model.name)}/model.json`, project);
	await mkdir(new URL(".", path), { recursive: true });
	await writeFile(path, JSON.stringify(model, null, 2));
}

export async function readLocalSlice(project: URL, id: string): Promise<SharedSlice | undefined> {
	const slices = await readLocalSlices(project);
	return slices.find((s) => s.id === id);
}

export async function readLocalSlices(project: URL): Promise<SharedSlice[]> {
	const dir = new URL("slices/", project);
	const entries = await readdir(dir).catch(() => [] as string[]);
	const result: SharedSlice[] = [];
	for (const name of entries) {
		try {
			result.push(JSON.parse(await readFile(new URL(`${name}/model.json`, dir), "utf8")));
		} catch {}
	}
	return result;
}
