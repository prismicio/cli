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
	await login({
		guest: {
			claimUrl: "https://example.com/claim",
			disablesAt: Date.now() + 60_000,
			deletesAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
		},
	});
	const { stdout, stderr, exitCode } = await prismic("repo", ["view", "--web"]);
	expect(exitCode, stderr).toBe(0);
	const link = new URL(stdout.match(/Opening (\S+)/)![1]);
	expect(link.pathname).toBe("/dashboard/guest/login");
	expect(link.searchParams.get("redirect_uri")).toBe(`https://${repo}.${host}/`);
});

it("refuses to work on a disabled temporary account", async ({ expect, prismic, login }) => {
	await login({
		guest: {
			claimUrl: "https://example.com/claim",
			disablesAt: Date.now() - 60_000,
			deletesAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
		},
	});
	const { stderr, exitCode } = await prismic("repo", ["view"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Your temporary account is disabled. Claim it to carry on.");
	expect(stderr).toMatch(
		/Temporary account, disabled, deleted in 14 days \(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z\)\. Claim it to keep your work: https:\/\/example\.com\/claim/,
	);
});

it("says a disabled temporary account was claimed, rather than to claim it", async ({
	expect,
	prismic,
	login,
	auth0,
}) => {
	await login({
		guest: {
			claimUrl: "https://example.com/claim",
			disablesAt: Date.now() - 60_000,
			deletesAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
		},
	});
	auth0.respondOnce("/user/profile", { status: 200, body: { guest: { status: "claimed" } } });
	const { stderr, exitCode } = await prismic("repo", ["view"]);
	expect(exitCode).toBe(1);
	expect(stderr.trim()).toBe(
		"Your temporary account has been claimed. Run `prismic login` to carry on with the account that claimed it.",
	);
});

it("says the temporary account was claimed, and logs out", async ({ expect, prismic, login }) => {
	await login({
		expiresAt: Date.now() - 1000,
		refreshToken: "deleted-by-claim",
		guest: {
			claimUrl: "https://example.com/claim",
			disablesAt: Date.now() + 60_000,
			deletesAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
		},
	});
	const { stderr, exitCode } = await prismic("repo", ["view"]);
	expect(exitCode).toBe(1);
	expect(stderr.trim()).toBe(
		"Your temporary account has been claimed. Run `prismic login` to carry on with the account that claimed it.",
	);
	expect((await prismic("whoami")).stderr).toContain("Not logged in.");
});

it("says the temporary account was deleted, and logs out", async ({ expect, prismic, login }) => {
	await login({
		expiresAt: Date.now() - 1000,
		refreshToken: "deleted-by-cleanup",
		guest: {
			claimUrl: "https://example.com/claim",
			disablesAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
			deletesAt: Date.now() - 60_000,
		},
	});
	const { stderr, exitCode } = await prismic("repo", ["view"]);
	expect(exitCode).toBe(1);
	expect(stderr.trim()).toBe(
		"Your temporary account has been deleted, along with its repositories. Run `prismic login` to start again.",
	);
	expect((await prismic("whoami")).stderr).toContain("Not logged in.");
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
