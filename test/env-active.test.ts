import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("env", ["active", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic env active [options]");
});

it("prints the production environment by default", async ({ expect, prismic, repo }) => {
	const { stdout, exitCode } = await prismic("env", ["active"]);
	expect(exitCode).toBe(0);
	expect(stdout.trim()).toBe(repo);
});
