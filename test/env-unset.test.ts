import { readFile, writeFile } from "node:fs/promises";

import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("env", ["unset", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic env unset [options]");
});

it("resets to the production environment", async ({ expect, prismic, repo, home, project }) => {
	await writeFile(
		new URL(".config/prismic/environments.json", home),
		JSON.stringify({ [project.toString()]: "my-stage-env" }),
	);

	const { stdout, exitCode } = await prismic("env", ["unset"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Reset to the production environment "${repo}".`);

	const after = await readFile(new URL(".config/prismic/environments.json", home), "utf8").catch(
		() => "{}",
	);
	expect(after).not.toContain("my-stage-env");
});
