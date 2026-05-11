import { access, readFile, rm, writeFile } from "node:fs/promises";

import { onTestFinished } from "vitest";

import { captureOutput, it } from "./it";
import {
	addPreview,
	cleanupRepository,
	createRepository,
	getPreviews,
	getRepository,
	setSimulatorUrl,
} from "./prismic";

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
	const rawName = `CLI-Test-${crypto.randomUUID().slice(0, 8)}`;
	const name = rawName.toLowerCase();
	onTestFinished(() => cleanupRepository(name, { token, password, host }));

	const { exitCode, stdout } = await prismic("init", ["--repo", rawName]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Created repository: ${name}`);
	expect(stdout).toContain(`Initialized Prismic for repository "${name}"`);

	const configRaw = await readFile(new URL("prismic.config.json", project), "utf-8");
	const config = JSON.parse(configRaw);
	expect(config.repositoryName).toBe(name);

	const repository = await getRepository({ repo: name, token, host });
	expect(repository.simulatorUrl).toBe("http://localhost:3000/slice-simulator");

	const previews = await getPreviews({ repo: name, token, host });
	const dev = previews.find((p) => p.url === "http://localhost:3000/api/preview");
	expect(dev?.label).toBe("Development");
}, 60_000);

it("preserves existing preview config", async ({
	expect,
	project,
	prismic,
	token,
	password,
	host,
}) => {
	const rawName = `CLI-Test-${crypto.randomUUID().slice(0, 8)}`;
	const name = rawName.toLowerCase();
	onTestFinished(() => cleanupRepository(name, { token, password, host }));
	await createRepository(name, { token, host });

	const presetSimulator = "https://staging.example.com/slice-simulator";
	await setSimulatorUrl(presetSimulator, { repo: name, token, host });
	await addPreview("https://staging.example.com/api/preview", "Staging", {
		repo: name,
		token,
		host,
	});

	await rm(new URL("prismic.config.json", project));
	const { exitCode } = await prismic("init", ["--repo", rawName]);
	expect(exitCode).toBe(0);

	const repository = await getRepository({ repo: name, token, host });
	expect(repository.simulatorUrl).toBe(presetSimulator);

	const previews = await getPreviews({ repo: name, token, host });
	expect(previews.map((p) => p.label)).toEqual(["Staging"]);
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
	expect(stderr).toContain(
		'Repository name "prismic" is already taken. Choose a different name or request access to it.',
	);
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
