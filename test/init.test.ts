import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { describe } from "vitest";

import { buildCustomType, captureOutput, it, readLocalCustomType, writeLocalCustomType } from "./it";
import {
	addPreview,
	createInstantStartRepository,
	createRepository,
	deleteCustomType,
	deleteRepository,
	deleteSlice,
	getCustomTypes,
	getOnboardingCompletedSteps,
	getPreviews,
	getRepository,
	getSlices,
	insertCustomType,
	setSimulatorUrl,
} from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("init", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic init [options]");
});

it("fails if prismic.config.json already exists without --repo", async ({ expect, prismic }) => {
	const { exitCode, stderr } = await prismic("init");
	expect(exitCode).toBe(1);
	expect(stderr).toContain("init --repo");
});

it("creates a repo if --repo is not provided and no legacy config exists", async ({
	expect,
	project,
	prismic,
	token,
	host,
	password,
	onTestFinished,
}) => {
	await rm(new URL("prismic.config.json", project));
	const { stderr, exitCode, stdout } = await prismic("init");
	const createdRepositoryMatch = stdout.match(/^Created repository: ([a-z0-9-]+)$/m);
	const name = createdRepositoryMatch?.[1];
	if (!name) throw new Error(`Could not find created repository name in output:\n${stdout}`);
	onTestFinished(() => deleteRepository(name, { token, password, host }));

	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Created repository:");
	expect(stdout).toContain("Initialized Prismic for repository");

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
	onTestFinished,
}) => {
	const rawName = `CLI-Test-${crypto.randomUUID().slice(0, 8)}`;
	const name = rawName.toLowerCase();
	onTestFinished(() => deleteRepository(name, { token, password, host }));
	await createRepository(name, { token, host });

	const presetSimulator = "https://staging.example.com/slice-simulator";
	await setSimulatorUrl(presetSimulator, { repo: name, token, host });
	await addPreview("https://staging.example.com/api/preview", "Staging", {
		repo: name,
		token,
		host,
	});

	await rm(new URL("prismic.config.json", project));
	const { stderr, exitCode } = await prismic("init", ["--repo", rawName]);
	expect(exitCode, stderr).toBe(0);

	const repository = await getRepository({ repo: name, token, host });
	expect(repository.simulatorUrl).toBe(presetSimulator);

	const previews = await getPreviews({ repo: name, token, host });
	expect(previews.map((p) => p.label)).toEqual(["Staging"]);
}, 60_000);

it("initializes a project with --repo when logged in", async ({
	expect,
	project,
	prismic,
	repo,
}) => {
	await rm(new URL("prismic.config.json", project));

	const { stderr, exitCode, stdout } = await prismic("init", ["--repo", repo]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Initialized Prismic for repository "${repo}"`);

	const configRaw = await readFile(new URL("prismic.config.json", project), "utf-8");
	const config = JSON.parse(configRaw);
	expect(config.repositoryName).toBe(repo);
}, 60_000);

it("reconnects an existing project with --repo", async ({ expect, project, prismic, repo }) => {
	await writeFile(
		new URL("prismic.config.json", project),
		JSON.stringify({
			repositoryName: "starter-placeholder",
			libraries: ["./src/slices"],
			routes: [{ type: "page", path: "/:uid" }],
		}),
	);

	const { stderr, exitCode } = await prismic("init", ["--repo", repo, "--no-setup"]);
	expect(exitCode, stderr).toBe(0);

	const config = JSON.parse(await readFile(new URL("prismic.config.json", project), "utf-8"));
	expect(config).toMatchObject({
		repositoryName: repo,
		libraries: ["./src/slices"],
		routes: [{ type: "page", path: "/:uid" }],
	});
}, 60_000);

it("skips framework scaffolding with --no-setup", async ({ expect, project, prismic, repo }) => {
	await rm(new URL("prismic.config.json", project));

	const { stderr, exitCode } = await prismic("init", ["--repo", repo, "--no-setup"]);
	expect(exitCode, stderr).toBe(0);

	// The config file is still written.
	const configRaw = await readFile(new URL("prismic.config.json", project), "utf-8");
	expect(JSON.parse(configRaw).repositoryName).toBe(repo);

	// No @prismicio/* packages are added and no install is run.
	const packageJson = JSON.parse(await readFile(new URL("package.json", project), "utf-8"));
	expect(packageJson.dependencies).not.toHaveProperty("@prismicio/client");
	await expect(access(new URL("package-lock.json", project))).rejects.toThrow();
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

it("uninstalls Slice Machine packages when migrating", async ({
	expect,
	project,
	prismic,
	repo,
}) => {
	await rm(new URL("prismic.config.json", project));
	await writeFile(
		new URL("package.json", project),
		JSON.stringify({
			dependencies: { next: "latest" },
			devDependencies: {
				"slice-machine-ui": "^2.0.0",
				// A non-matching adapter, to verify any @slicemachine/adapter-* is removed.
				"@slicemachine/adapter-nuxt": "^0.3.0",
			},
		}),
	);
	await writeFile(
		new URL("slicemachine.config.json", project),
		JSON.stringify({ repositoryName: repo, libraries: ["./src/slices"] }),
	);

	const proc = prismic("init");
	const output = captureOutput(proc);
	await expect.poll(output, { timeout: 15_000 }).toContain("Migrated slicemachine.config.json");
	proc.kill();

	const packageJson = JSON.parse(await readFile(new URL("package.json", project), "utf-8"));
	const allDependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
	expect(allDependencies).not.toHaveProperty("slice-machine-ui");
	expect(allDependencies).not.toHaveProperty("@slicemachine/adapter-nuxt");
	expect(allDependencies).toHaveProperty("next");
});

it("fails when Type Builder is not enabled", async ({ expect, project, prismic, repo }) => {
	await rm(new URL("prismic.config.json", project));
	const { exitCode, stderr } = await prismic("init", ["--repo", repo], {
		nodeOptions: { env: { PRISMIC_TYPE_BUILDER_ENABLED: "false" } },
	});
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Type Builder");
});

it("installs dependencies", { timeout: 30_000 }, async ({ expect, project, prismic, repo }) => {
	await rm(new URL("prismic.config.json", project));

	const { stderr, exitCode } = await prismic("init", ["--repo", repo]);
	expect(exitCode, stderr).toBe(0);

	// Verify the stubbed npm was invoked (it creates package-lock.json)
	await expect(access(new URL("package-lock.json", project))).resolves.toBeUndefined();
});

it("warns and keeps local models when reconnecting with model differences", async ({
	expect,
	project,
	prismic,
	repo,
}) => {
	// A local-only model makes the local/remote diff contain a deletion, which
	// blocks the automatic sync during an existing-project reconnect.
	const localOnly = buildCustomType();
	await writeLocalCustomType(project, localOnly);

	const { stderr, exitCode } = await prismic("init", ["--repo", repo, "--no-setup"]);
	expect(exitCode, stderr).toBe(0);
	expect(stderr).toContain("Choose the source of truth");

	const localModel = await readLocalCustomType(project, localOnly.id);
	expect(localModel).toEqual(localOnly);
}, 60_000);

describe("with an isolated repository", () => {
	it.scoped({ isolateRepo: true });

	it("warns and keeps local models when reconnecting with a modified model", async ({
		expect,
		project,
		prismic,
		repo,
		token,
		host,
	}) => {
		const model = buildCustomType();
		await insertCustomType(model, { repo, token, host });
		const modified = { ...model, label: `${model.label}Modified` };
		await writeLocalCustomType(project, modified);

		const { stderr, exitCode } = await prismic("init", ["--repo", repo, "--no-setup"]);
		expect(exitCode, stderr).toBe(0);
		expect(stderr).toContain("Choose the source of truth");

		const localModel = await readLocalCustomType(project, model.id);
		expect(localModel).toEqual(modified);
	}, 60_000);
});

it.skip("completes the handoff for a starter project", async ({
	expect,
	project,
	prismic,
	token,
	host,
	password,
}) => {
	const repo = await createInstantStartRepository({ token, host });
	try {
		await writeFile(
			new URL("package.json", project),
			JSON.stringify({ name: "next-instant-start", dependencies: { next: "latest" } }),
		);
		await mkdir(new URL("documents/", project), { recursive: true });
		await writeFile(new URL("documents/homepage.json", project), "{}");

		const { stderr, exitCode } = await prismic("init", ["--repo", repo, "--no-setup"]);
		expect(exitCode, stderr).toBe(0);

		const config = JSON.parse(await readFile(new URL("prismic.config.json", project), "utf-8"));
		expect(config.repositoryName).toBe(repo);

		// Seed documents are removed.
		await expect(access(new URL("documents/", project))).rejects.toThrow();

		// The hosted preview is replaced by the local Development preview.
		const previews = await getPreviews({ repo, token, host });
		const previewLabels = previews.map((preview) => preview.label);
		expect(previewLabels).toContain("Development");
		expect(previewLabels).not.toContain("Production");

		const repository = await getRepository({ repo, token, host });
		expect(repository.simulatorUrl).toBe("http://localhost:3000/slice-simulator");

		const completedSteps = await getOnboardingCompletedSteps({ repo, token, host });
		expect(completedSteps).toContain("instantStart_continueBuildingLocally");
	} finally {
		await deleteRepository(repo, { token, password, host });
	}
}, 120_000);

it.skip("keeps seed documents when the local package does not match the starter", async ({
	expect,
	project,
	prismic,
	token,
	host,
	password,
}) => {
	const repo = await createInstantStartRepository({ token, host });
	try {
		// The fixture package.json has no name, so it cannot match the starter.
		await mkdir(new URL("documents/", project), { recursive: true });
		await writeFile(new URL("documents/homepage.json", project), "{}");

		const { stderr, exitCode } = await prismic("init", ["--repo", repo, "--no-setup"]);
		expect(exitCode, stderr).toBe(0);
		expect(stderr).toContain("Starter seed documents were not removed");

		await expect(access(new URL("documents/", project))).resolves.toBeUndefined();
	} finally {
		await deleteRepository(repo, { token, password, host });
	}
}, 120_000);

it.skip("fails when the starter repository has no models", async ({
	expect,
	prismic,
	token,
	host,
	password,
}) => {
	const repo = await createInstantStartRepository({ token, host });
	try {
		const [customTypes, slices] = await Promise.all([
			getCustomTypes({ repo, token, host }),
			getSlices({ repo, token, host }),
		]);
		await Promise.all([
			...customTypes.map((customType) => deleteCustomType(customType.id, { repo, token, host })),
			...slices.map((slice) => deleteSlice(slice.id, { repo, token, host })),
		]);

		const { stderr, exitCode } = await prismic("init", ["--repo", repo, "--no-setup"]);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("has no starter models");
	} finally {
		await deleteRepository(repo, { token, password, host });
	}
}, 120_000);
