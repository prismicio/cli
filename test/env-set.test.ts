import { readFile, writeFile } from "node:fs/promises";

import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("env", ["set", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic env set <env> [options]");
});

// TODO: test setting the active environment to a stage environment (the common
// happy path) once we can create environments on the test repo.

it("resets to the production environment", async ({ expect, prismic, repo, home, project }) => {
	await writeFile(
		new URL(".config/prismic/environments.json", home),
		JSON.stringify({ [project.toString()]: "my-stage-env" }),
	);

	const { stdout, exitCode } = await prismic("env", ["set", repo]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Reset to the production environment "${repo}".`);

	const after = await readFile(new URL(".config/prismic/environments.json", home), "utf8").catch(
		() => "{}",
	);
	expect(after).not.toContain("my-stage-env");
});

it("errors on an invalid environment", async ({ expect, prismic, repo }) => {
	const { stderr, exitCode } = await prismic("env", ["set", "not-a-real-env"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain(repo);
});
