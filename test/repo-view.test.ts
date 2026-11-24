import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["view", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic repo view [options]");
});

it("views repository details", async ({ expect, prismic, repo }) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["view"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(repo);
});

it("views repository details as JSON", async ({ expect, prismic, repo }) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["view", "--json"]);
	expect(exitCode, stderr).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(
		expect.objectContaining({
			domain: repo,
			url: expect.stringContaining(repo),
			apiAccess: expect.any(String),
		}),
	);
});

it("opens a temporary account's repository with a link that logs in", async ({
	expect,
	prismic,
	login,
	repo,
	host,
}) => {
	await login({ guest: { claimUrl: "https://example.com/claim", expiresAt: Date.now() + 60_000 } });
	const { stdout, stderr, exitCode } = await prismic("repo", ["view", "--web"]);
	expect(exitCode, stderr).toBe(0);
	const link = new URL(stdout.match(/Opening (\S+)/)![1]);
	expect(link.pathname).toBe("/dashboard/guest/open");
	expect(link.searchParams.get("redirect_uri")).toBe(`https://${repo}.${host}/`);
});

it("views repository details with a Write API token", async ({
	expect,
	prismic,
	repo,
	writeToken,
}) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["view"], {
		nodeOptions: { env: { PRISMIC_TOKEN: writeToken } },
	});
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(repo);
	expect(stdout).toContain("Content API: (unavailable)");
});
