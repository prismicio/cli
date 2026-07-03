import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("env", ["unset", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic env unset [options]");
});

it("resets to the production environment", async ({ expect, prismic, repo }) => {
	const { stdout, exitCode } = await prismic("env", ["unset"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Reset to the production environment "${repo}".`);
});
