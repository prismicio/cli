import { access, readFile, rm, writeFile } from "node:fs/promises";

import { captureOutput, it } from "./it";

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

it("creates a repo if --repo is not provided and no legacy config exists", async ({
	expect,
	project,
	prismic,
}) => {
	await rm(new URL("prismic.config.json", project));
	const { exitCode, stdout } = await prismic("init");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Created repository:");
	expect(stdout).toContain("Initialized Prismic for repository");

	const configRaw = await readFile(new URL("prismic.config.json", project), "utf-8");
	const config = JSON.parse(configRaw);
	expect(config.repositoryName).toMatch(/^[a-f0-9]{8}$/);
}, 60_000);

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

it("fails if repo is not in the user's account", async ({ expect, project, prismic }) => {
	await rm(new URL("prismic.config.json", project));
	const { exitCode, stderr } = await prismic("init", ["--repo", "nonexistent-repo-xyz-12345"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("not found in your account");
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
