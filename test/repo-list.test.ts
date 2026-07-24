import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["list", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic repo list [options]");
});

it("lists repositories", async ({ expect, prismic, repo }) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["list"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(repo);
});

it("lists repositories as JSON", async ({ expect, prismic, repo }) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["list", "--json"]);
	expect(exitCode, stderr).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(expect.arrayContaining([expect.objectContaining({ domain: repo })]));
});
