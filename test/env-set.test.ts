import { mkdir, readFile, writeFile } from "node:fs/promises";

import { it, useSvelteKit } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("env", ["set", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic env set <environment> [options]");
});

// TODO: Test setting a non-production environment once the e2e setup can create
// one. It should write the environment's domain to .env.local as the active
// repository. The test repository only has production, so it can't be covered yet.

it("clears the active environment when setting to production", async ({
	expect,
	prismic,
	project,
	repo,
}) => {
	const path = new URL(".env.local", project);
	await writeFile(path, "NEXT_PUBLIC_PRISMIC_ENVIRONMENT=my-repo-staging");

	const { stdout, exitCode } = await prismic("env", ["set", repo]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("production");

	const after = await readFile(path, "utf8");
	expect(after).not.toContain("NEXT_PUBLIC_PRISMIC_ENVIRONMENT");
	expect(after).not.toContain("my-stage-env");
});

it("asks for the Prismic environment variable in a SvelteKit env file", async ({
	expect,
	prismic,
	project,
	repo,
}) => {
	await useSvelteKit(project);
	await mkdir(new URL("src/", project), { recursive: true });
	await writeFile(new URL("src/env.ts", project), "export const variables = {};\n");

	const { stdout, exitCode } = await prismic("env", ["set", repo]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Action required: add PUBLIC_PRISMIC_ENVIRONMENT to src/env.ts.");
});

it("prints setup instructions", async ({ expect, prismic, repo }) => {
	const { stdout, exitCode } = await prismic("env", ["set", repo]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Action required: add <PrismicPreview> to your root layout.");
});

it("rejects an unknown environment", async ({ expect, prismic }) => {
	const { exitCode } = await prismic("env", ["set", "does-not-exist"]);
	expect(exitCode).toBe(1);
});
