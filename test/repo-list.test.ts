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

it("lists the one repository a Write API token can write to", async ({
	expect,
	prismic,
	repo,
	host,
	writeToken,
}) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["list", "--json"], {
		nodeOptions: { env: { PRISMIC_TOKEN: writeToken } },
	});
	expect(exitCode, stderr).toBe(0);
	const parsed: unknown = JSON.parse(stdout);
	expect(parsed).toEqual([
		{
			domain: repo,
			name: expect.any(String),
			role: expect.any(String),
			url: `https://${repo}.${host}/`,
		},
	]);
});
