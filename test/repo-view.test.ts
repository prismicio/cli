import { it } from "./it";
import { createWriteToken, deleteWriteToken } from "./prismic";

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

it("reports an invalid PRISMIC_TOKEN", async ({ expect, prismic, logout }) => {
	await logout();
	const { stderr, exitCode } = await prismic("repo", ["view"], {
		nodeOptions: { env: { PRISMIC_TOKEN: "invalid-token" } },
	});
	expect(exitCode).not.toBe(0);
	expect(stderr).toContain("PRISMIC_TOKEN is invalid or expired");
});

// Wroom 500s under concurrent same-user write-token creates; keep this sequential.
it(
	"views the repository with a Write API token",
	{ concurrent: false },
	async ({ expect, prismic, repo, token, host }) => {
		const writeToken = await createWriteToken({ repo, token, host });
		try {
			const text = await prismic("repo", ["view"], {
				nodeOptions: { env: { PRISMIC_TOKEN: writeToken.token } },
			});
			expect(text.exitCode, text.stderr).toBe(0);
			expect(text.stdout).toContain(`Domain: ${repo}`);
			expect(text.stdout).toContain(`https://${repo}.${host}/`);
			expect(text.stdout).not.toContain("Content API:");
			expect(text.stderr).not.toContain("This Write API token cannot run administrative commands");
			expect(text.stderr).not.toContain("PRISMIC_TOKEN is invalid or expired");

			const json = await prismic("repo", ["view", "--json"], {
				nodeOptions: { env: { PRISMIC_TOKEN: writeToken.token } },
			});
			expect(json.exitCode, json.stderr).toBe(0);
			expect(JSON.parse(json.stdout)).toEqual({
				domain: repo,
				name: null,
				url: `https://${repo}.${host}/`,
				apiAccess: null,
			});
		} finally {
			await deleteWriteToken(writeToken.token, { repo, token, host });
		}
	},
);
