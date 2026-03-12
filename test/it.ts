import type { Result } from "tinyexec";

import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { x } from "tinyexec";
import { inject, test } from "vitest";

const BIN = fileURLToPath(new URL("../dist/index.mjs", import.meta.url));

const E2E_PRISMIC_EMAIL = process.env.E2E_PRISMIC_EMAIL!;
const PRISMIC_HOST = process.env.PRISMIC_HOST ?? "prismic.io";

export type Fixtures = {
	home: URL;
	project: URL;
	prismic: typeof x;
	login: () => Promise<{ token: string; email: string }>;
	logout: () => Promise<void>;
	token: string;
	repo: string;
	setupPackageJson: (args: { dependencies?: Record<string, string> }) => Promise<void>;
};

export const it = test.extend<Fixtures>({
	// oxlint-disable-next-line no-empty-pattern
	home: async ({}, use) => {
		const dir = await mkdtemp(join(tmpdir(), "prismic-test-"));
		await use(pathToFileURL(dir + "/"));
		await rm(dir, { recursive: true, force: true });
	},
	project: async ({ home }, use) => {
		const projectPath = new URL(randomUUID() + "/", home);
		await mkdir(projectPath, { recursive: true });
		await use(projectPath);
	},
	setupPackageJson: async ({ project }, use) => {
		const packageJsonPath = new URL("package.json", project);
		await use(async ({ dependencies }) => {
			await writeFile(packageJsonPath, JSON.stringify({ dependencies }));
		});
	},
	// oxlint-disable-next-line no-empty-pattern
	token: async ({}, use) => {
		await use(inject("token"));
	},
	login: async ({ token, home }, use) => {
		await use(async () => {
			await writeFile(new URL(".prismic", home), JSON.stringify({ token, host: PRISMIC_HOST }));
			return { token, email: E2E_PRISMIC_EMAIL };
		});
	},
	logout: async ({ home }, use) => {
		await use(async () => {
			await rm(new URL(".prismic", home), { recursive: true, force: true });
		});
	},
	prismic: async ({ home, project, login }, use) => {
		await login();
		const procs: Result[] = [];
		await use((command, args = [], options) => {
			const env = {
				...process.env,
				...options?.nodeOptions?.env,
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
