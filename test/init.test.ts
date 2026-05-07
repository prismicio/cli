import { access, readFile, rm, writeFile } from "node:fs/promises";

import { onTestFinished } from "vitest";

import { captureOutput, it } from "./it";
import { deleteRepository } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("init", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic init [options]");
});

it("fails if prismic.config.json already exists", async ({ expect, prismic }) => {
	const { exitCode, stderr } = await prismic("init", ["--repo", "test"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("already initialized");
});

it("creates a repo when --repo doesn't exist yet", async ({
	expect,
	project,
	prismic,
	token,
	host,
	password,
}) => {
	await rm(new URL("prismic.config.json", project));
	const name = `cli-test-${crypto.randomUUID().slice(0, 8)}`;
	onTestFinished(() => deleteRepository(name, { token, password, host }));

	const { exitCode, stdout } = await prismic("init", ["--repo", name]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Created repository: ${name}`);
	expect(stdout).toContain(`Initialized Prismic for repository "${name}"`);

	const configRaw = await readFile(new URL("prismic.config.json", project), "utf-8");
	const config = JSON.parse(configRaw);
	expect(config.repositoryName).toBe(name);
}, 60_000);

it("fails when --repo is not provided", async ({ expect, project, prismic }) => {
	await rm(new URL("prismic.config.json", project));
	const { exitCode, stderr } = await prismic("init");
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Missing --repo");
});

it("initializes a project with --repo when logged in", async ({
	expect,
	project,
	prismic,
	repo,
}) => {
	await rm(new URL("prismic.config.json", project));

	const { exitCode, stdout } = await prismic("init", ["--repo", repo]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Initialized Prismic for repository "${repo}"`);

	const configRaw = await readFile(new URL("prismic.config.json", project), "utf-8");
	const config = JSON.parse(configRaw);
	expect(config.repositoryName).toBe(repo);
}, 60_000);

it("triggers login flow when not logged in", async ({ expect, project, prismic, logout, repo }) => {
	await rm(new URL("prismic.config.json", project));
	await logout();

	const proc = prismic("init", ["--repo", repo, "--no-browser"]);
	const output = captureOutput(proc);

	// Verify login flow starts, then kill — no need to complete it
	await expect.poll(output, { timeout: 15_000 }).toMatch(/port=(\d+)/);
	proc.kill();
});

it("fails if --repo is taken by another account", async ({ expect, project, prismic }) => {
	await rm(new URL("prismic.config.json", project));
	// "prismic" is reserved/taken and will fail availability check.
	const { exitCode, stderr } = await prismic("init", ["--repo", "prismic"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("not in your account");
});

it("migrates slicemachine.config.json", async ({ expect, project, prismic, repo }) => {
	await rm(new URL("prismic.config.json", project));
	await writeFile(
		new URL("slicemachine.config.json", project),
		JSON.stringify({
			repositoryName: repo,
			libraries: ["./src/slices"],
		}),
	);

	const proc = prismic("init");
	const output = captureOutput(proc);

	// Wait for migration to complete, then kill — no need to wait for sync/install
	await expect.poll(output, { timeout: 15_000 }).toContain("Migrated slicemachine.config.json");
	proc.kill();

	const configRaw = await readFile(new URL("prismic.config.json", project), "utf-8");
	const config = JSON.parse(configRaw);
	expect(config.repositoryName).toBe(repo);
	expect(config.libraries).toEqual(["./src/slices"]);

	// Verify legacy config was deleted
	await expect(access(new URL("slicemachine.config.json", project))).rejects.toThrow();
});

it("fails when Type Builder is not enabled", async ({ expect, project, prismic, repo }) => {
	await rm(new URL("prismic.config.json", project));
	const { exitCode, stderr } = await prismic("init", ["--repo", repo], {
		nodeOptions: { env: { PRISMIC_TYPE_BUILDER_ENABLED: "false" } },
	});
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Type Builder");
});

it("installs dependencies", async ({ expect, project, prismic, repo }) => {
	await rm(new URL("prismic.config.json", project));

	const { exitCode } = await prismic("init", ["--repo", repo]);
	expect(exitCode).toBe(0);

	// Verify the stubbed npm was invoked (it creates package-lock.json)
	await expect(access(new URL("package-lock.json", project))).resolves.toBeUndefined();
});
