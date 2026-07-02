import { readFile, writeFile } from "node:fs/promises";

import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("env", ["unset", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic env unset [options]");
});

it("unsets the active environment", async ({ expect, prismic, project }) => {
	const path = new URL(".env.local", project);
	await writeFile(path, "NEXT_PUBLIC_PRISMIC_ENVIRONMENT=my-repo-staging\n");

	const { exitCode } = await prismic("env", ["unset"]);
	expect(exitCode).toBe(0);
	expect(await readFile(path, "utf8")).not.toContain("my-repo-staging");
});
