import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("env", ["set", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic env set <name> [options]");
});

it("rejects an unknown environment", async ({ expect, prismic, repo }) => {
	const { stderr, exitCode } = await prismic("env", ["set", "does-not-exist"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain(`No environments available on repository "${repo}".`);
});

it("resets to production when set to the production environment", async ({
	expect,
	prismic,
	repo,
}) => {
	const { stdout, exitCode } = await prismic("env", ["set", repo]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Reset to the production environment "${repo}".`);
});
