import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("whoami", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic whoami [options]");
});

it("prints email of logged-in user", async ({ expect, prismic, login }) => {
	const { email } = await login();
	const { stdout, stderr, exitCode } = await prismic("whoami");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(email);
});

it("fails when not logged in", async ({ expect, prismic, logout }) => {
	await logout();
	const { stderr, exitCode } = await prismic("whoami");
	expect(exitCode).not.toBe(0);
	expect(stderr).toContain("Not logged in. Run `prismic login` first.");
});

it("reports invalid PRISMIC_TOKEN", async ({ expect, prismic, logout }) => {
	await logout();
	const { stderr, exitCode } = await prismic("whoami", [], {
		nodeOptions: { env: { PRISMIC_TOKEN: "invalid-token" } },
	});
	expect(exitCode).not.toBe(0);
	expect(stderr).toContain("PRISMIC_TOKEN is invalid or expired");
});

it("reports stored token auth failure", async ({ expect, prismic, login }) => {
	await login({ accessToken: "invalid-token" });
	const { stderr, exitCode } = await prismic("whoami");
	expect(exitCode).not.toBe(0);
	expect(stderr).toContain("Your session is invalid or expired.");
});

it("uses PRISMIC_TOKEN env var when set", async ({ expect, prismic, login, logout, token }) => {
	const { email } = await login();
	await logout();
	const { stdout, stderr, exitCode } = await prismic("whoami", [], {
		nodeOptions: { env: { PRISMIC_TOKEN: token } },
	});
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(email);
});

it("reports a Write API token", async ({ expect, prismic, repo, writeToken }) => {
	const { stdout, stderr, exitCode } = await prismic("whoami", [], {
		nodeOptions: { env: { PRISMIC_TOKEN: writeToken } },
	});
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Write API token");
	expect(stdout).toContain(repo);
});

it("refreshes a login about to expire", async ({ expect, prismic, login, auth0 }) => {
	// The fake Auth0 refreshes to the e2e token.
	const { email } = await login({ accessToken: "stale-token", expiresAt: Date.now() + 60_000 });
	const { stdout, stderr, exitCode } = await prismic("whoami");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(email);
	const refreshes = auth0.requests.filter(
		(request) => request.params.grant_type === "refresh_token",
	);
	expect(refreshes).toHaveLength(1);
});
