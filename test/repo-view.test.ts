import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("repo", ["view", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic repo view [options]");
});

it("views repository details", async ({ expect, prismic, repo }) => {
	const { stdout, exitCode } = await prismic("repo", ["view"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(repo);
});

it("views repository details as JSON", async ({ expect, prismic, repo }) => {
	const { stdout, exitCode } = await prismic("repo", ["view", "--json"]);
	expect(exitCode).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(
		expect.objectContaining({
			domain: repo,
			url: expect.stringContaining(repo),
			apiAccess: expect.any(String),
		}),
	);
});
