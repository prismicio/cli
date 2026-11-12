import { approveLogin, captureOutput, it } from "./it";

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

it("logs in and continues when not logged in", async ({ expect, prismic, logout, auth0, repo }) => {
	await logout();
	const proc = prismic("repo", ["list", "--json"], { nodeOptions: { env: { CI: "" } } });
	const output = captureOutput(proc);
	const stdout = captureOutput(proc, { stderr: false });
	await approveLogin(expect, output, auth0);
	const { exitCode } = await proc;
	expect(exitCode, output()).toBe(0);
	expect(output()).toContain("You are not logged in.");
	expect(output()).toContain("Logged in to Prismic as");
	// The login prompt stays out of the command's output.
	expect(JSON.parse(stdout())).toEqual(
		expect.arrayContaining([expect.objectContaining({ domain: repo })]),
	);
});

it("logs in again and continues when the session ended", async ({
	expect,
	prismic,
	login,
	auth0,
	repo,
}) => {
	// Auth0 no longer knows this refresh token.
	await login({ refreshToken: "ended", expiresAt: Date.now() - 1000 });
	const proc = prismic("repo", ["list"], { nodeOptions: { env: { CI: "" } } });
	const output = captureOutput(proc);
	await approveLogin(expect, output, auth0);
	const { exitCode } = await proc;
	expect(exitCode, output()).toBe(0);
	expect(output()).toContain("Your login expired.");
	expect(output()).toContain(repo);
});

it("doesn't log in when Auth0 can't be reached", async ({ expect, prismic, login, auth0 }) => {
	// The server refuses the token, so the CLI must renew it.
	await login({ accessToken: "rejected-token" });
	auth0.respondOnce("/oauth/token", { status: 503 });
	const { stderr, exitCode } = await prismic("repo", ["list"], {
		nodeOptions: { env: { CI: "" } },
	});
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Can't reach the Prismic login service.");
	expect(stderr).not.toContain("Open this URL");
});
