import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("env", ["list", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic env list [options]");
});

it("lists environments and marks the active one", async ({ expect, prismic, repo }) => {
	const { stdout, exitCode } = await prismic("env", ["list"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(repo);
	expect(stdout).toContain("(active)");
});

it("lists environments as JSON", async ({ expect, prismic, repo }) => {
	const { stdout, exitCode } = await prismic("env", ["list", "--json"]);
	expect(exitCode).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(
		expect.arrayContaining([expect.objectContaining({ domain: repo, active: true })]),
	);
});
