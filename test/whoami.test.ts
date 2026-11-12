import { chmod } from "node:fs/promises";

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

it("doesn't send a login's token to another host", async ({ expect, prismic, login, host }) => {
	await login({ host: "example.com" });
	const { stderr, exitCode } = await prismic("whoami", [], {
		nodeOptions: { env: { PRISMIC_HOST: host } },
	});
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

it("uses a token that hasn't expired when Auth0 can't be reached", async ({
	expect,
	prismic,
	login,
	auth0,
}) => {
	const { email } = await login({ expiresAt: Date.now() + 60_000 });
	auth0.respondOnce("/oauth/token", { status: 503 });
	const { stdout, stderr, exitCode } = await prismic("whoami");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(email);
	expect(auth0.requestsTo("/oauth/token")).toHaveLength(1);
});

it("refreshes a login about to expire, once for parallel commands", async ({
	expect,
	prismic,
	login,
	auth0,
}) => {
	// The fake Auth0 refreshes to the e2e token.
	const { email } = await login({ accessToken: "stale-token", expiresAt: Date.now() + 60_000 });
	const results = await Promise.all([prismic("whoami"), prismic("whoami")]);
	for (const { stdout, stderr, exitCode } of results) {
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain(email);
	}
	expect(auth0.requestsTo("/oauth/token")).toHaveLength(1);
});

// Some agent sandboxes can't write to the home folder.
it.skipIf(process.platform === "win32")(
	"works in a config folder it can't write, until the token expires",
	async ({ expect, home, prismic, login }) => {
		const configDir = new URL(".config/prismic/", home);
		const { email } = await login({ expiresAt: Date.now() + 60_000 });
		await chmod(configDir, 0o500);
		try {
			const fresh = await prismic("whoami");
			expect(fresh.exitCode, fresh.stderr).toBe(0);
			expect(fresh.stdout).toContain(email);

			await chmod(configDir, 0o700);
			await login({ expiresAt: Date.now() - 1000 });
			await chmod(configDir, 0o500);
			const expired = await prismic("whoami");
			expect(expired.exitCode).toBe(1);
			expect(expired.stderr).toContain("Set PRISMIC_CONFIG_DIR to a folder you can write to.");
		} finally {
			await chmod(configDir, 0o700);
		}
	},
);
