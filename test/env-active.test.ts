import { writeFile } from "node:fs/promises";

import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("env", ["active", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic env active [options]");
});

it("prints a configured environment", async ({ expect, prismic, home, project }) => {
	await writeFile(
		new URL(".config/prismic/environments.json", home),
		JSON.stringify({ [project.toString()]: "my-stage-env" }),
	);

	const { stdout, exitCode } = await prismic("env", ["active"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("my-stage-env");
});

it("defaults to the production environment", async ({ expect, prismic, repo }) => {
	const { stdout, exitCode } = await prismic("env", ["active"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(repo);
});
