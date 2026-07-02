import { writeFile } from "node:fs/promises";

import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("env", ["active", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic env active [options]");
});

it("prints production when no environment is active", async ({ expect, prismic, repo }) => {
	const { stdout, exitCode } = await prismic("env", ["active"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`${repo} (production)`);
});

it("reads the active environment from .env.local", async ({ expect, prismic, project }) => {
	await writeFile(
		new URL(".env.local", project),
		"NEXT_PUBLIC_PRISMIC_ENVIRONMENT=my-repo-staging\n",
	);

	const { stdout, exitCode } = await prismic("env", ["active"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("my-repo-staging");
});
