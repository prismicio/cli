import { readFile, writeFile } from "node:fs/promises";

import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("env", ["unset", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic env unset [options]");
});

it("resets to the production environment", async ({ expect, prismic, repo, project }) => {
	const path = new URL(".env.local", project);
	await writeFile(path, "NEXT_PUBLIC_PRISMIC_ENVIRONMENT=my-repo-staging");

	const { stdout, exitCode } = await prismic("env", ["unset"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Reset to the production environment "${repo}".`);

	const after = await readFile(path, "utf8");
	expect(after).not.toContain("NEXT_PUBLIC_PRISMIC_ENVIRONMENT");
	expect(after).not.toContain("my-stage-env");
});
