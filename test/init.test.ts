import { readFile, writeFile, access } from "node:fs/promises";

import { captureOutput, it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("init", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("USAGE");
});

it("fails if prismic.config.json already exists", async ({
	expect,
	project,
	prismic,
	setupPackageJson,
}) => {
	await setupPackageJson({ dependencies: { next: "latest" } });
	await writeFile(
		new URL("prismic.config.json", project),
		JSON.stringify({ repositoryName: "test" }),
	);
	const { exitCode, stderr } = await prismic("init", ["--repo", "test"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("already initialized");
});

it("fails if --repo is not provided and no legacy config exists", async ({
	expect,
	prismic,
	setupPackageJson,
}) => {
	await setupPackageJson({ dependencies: { next: "latest" } });
	const { exitCode, stderr } = await prismic("init");
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Missing required flag");
});

it("initializes a project with --repo when logged in", async ({
	expect,
	project,
	prismic,
	repo,
	setupPackageJson,
}) => {
	await setupPackageJson({ dependencies: { next: "latest" } });

	const { exitCode, stdout } = await prismic("init", ["--repo", repo]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Initialized Prismic for repository "${repo}"`);

	const configRaw = await readFile(new URL("prismic.config.json", project), "utf-8");
	const config = JSON.parse(configRaw);
	expect(config.repositoryName).toBe(repo);
}, 60_000);

it("triggers login flow when not logged in, then initializes", async ({
	expect,
	prismic,
	token,
	logout,
	repo,
	setupPackageJson,
}) => {
	await setupPackageJson({ dependencies: { next: "latest" } });
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

it("fails if repo is not in the user's account", async ({ expect, prismic, setupPackageJson }) => {
	await setupPackageJson({ dependencies: { next: "latest" } });
	const { exitCode, stderr } = await prismic("init", ["--repo", "nonexistent-repo-xyz-12345"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("not found in your account");
}, 30_000);

it("migrates slicemachine.config.json", async ({
	expect,
	project,
	prismic,
	repo,
	setupPackageJson,
}) => {
	await setupPackageJson({ dependencies: { next: "latest" } });

	// Write a legacy slicemachine.config.json
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
