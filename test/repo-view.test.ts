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

// Wroom 500s under concurrent same-user write-token creates; keep this sequential.
it(
	"views repository details with a Write API token",
	{ concurrent: false },
	async ({ expect, prismic, repo, writeToken }) => {
		const { stdout, stderr, exitCode } = await prismic("repo", ["view", "--json"], {
			nodeOptions: { env: { PRISMIC_TOKEN: writeToken } },
		});
		expect(exitCode, stderr).toBe(0);
		expect(JSON.parse(stdout)).toEqual(expect.objectContaining({ domain: repo, apiAccess: null }));
	},
);
