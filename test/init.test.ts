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

it("fails if --repo is not provided and no legacy config exists", async ({
	expect,
	project,
	prismic,
}) => {
	await rm(new URL("prismic.config.json", project));
	const { exitCode, stderr } = await prismic("init");
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Missing required flag");
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

it("triggers login flow when not logged in, then initializes", async ({
	expect,
	project,
	prismic,
	token,
	logout,
	repo,
}) => {
	await rm(new URL("prismic.config.json", project));
	await logout();

	const proc = prismic("init", ["--repo", repo, "--no-browser"]);
	const output = captureOutput(proc);

	// Wait for the login server to start and print the URL with port
	await expect.poll(output, { timeout: 15_000 }).toMatch(/port=(\d+)/);

	const port = output().match(/port=(\d+)/)![1];
	await fetch(`http://localhost:${port}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			cookies: [`prismic-auth=${token}; path=/`],
			email: process.env.E2E_PRISMIC_EMAIL,
		}),
	});

	await expect
		.poll(output, { timeout: 30_000 })
		.toContain(`Initialized Prismic for repository "${repo}"`);
}, 60_000);

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

	const { exitCode, stdout } = await prismic("init");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Migrated slicemachine.config.json");

	const configRaw = await readFile(new URL("prismic.config.json", project), "utf-8");
	const config = JSON.parse(configRaw);
	expect(config.repositoryName).toBe(repo);
	expect(config.libraries).toEqual(["./src/slices"]);

	// Verify legacy config was deleted
	await expect(access(new URL("slicemachine.config.json", project))).rejects.toThrow();
}, 60_000);

it("installs dependencies", async ({ expect, project, prismic, repo }) => {
	await rm(new URL("prismic.config.json", project));

	const proc = prismic("init", ["--repo", repo]);
	const output = captureOutput(proc);

	await expect.poll(output, { timeout: 60_000 }).toContain("Initialized Prismic");

	await expect(access(new URL("package-lock.json", project))).resolves.toBeUndefined();
}, 60_000);
