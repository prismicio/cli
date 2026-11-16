import { chmod, readFile } from "node:fs/promises";

import { captureOutput, it, waitForLoginPrompt } from "./it";

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

it("reports when Prismic can't be reached", async ({ expect, prismic }) => {
	// The .invalid TLD never resolves, like a DNS failure when offline.
	const { stderr, exitCode } = await prismic("whoami", [], {
		nodeOptions: { env: { PRISMIC_HOST: "prismic.invalid" } },
	});
	expect(exitCode).toBe(1);
	expect(stderr).toContain(
		"Can't reach Prismic. Check your connection, then run the command again.",
	);
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
	home,
	prismic,
	login,
}) => {
	// The .invalid TLD never resolves, like a DNS failure when offline.
	const auth0Domain = "https://auth0.invalid";
	const { email } = await login({ auth0Domain, expiresAt: Date.now() + 60_000 });
	const fresh = await prismic("whoami");
	expect(fresh.exitCode, fresh.stderr).toBe(0);
	expect(fresh.stdout).toContain(email);

	await login({ auth0Domain, expiresAt: Date.now() - 1000 });
	const expired = await prismic("whoami");
	expect(expired.exitCode).toBe(1);
	expect(expired.stderr).toContain(
		"Can't reach the Prismic login service. Check your connection, then run the command again.",
	);
	const credentials = await readFile(new URL(".config/prismic/credentials.json", home), "utf8");
	expect(JSON.parse(credentials).refreshToken).toBeDefined();
});

// Unlike the `login` fixture, `prismic login` saves to the keychain where one
// is usable.
it("refreshes a login saved by `prismic login`", async ({
	expect,
	home,
	prismic,
	logout,
	auth0,
	token,
}) => {
	await logout();
	const login = prismic("login");
	const output = captureOutput(login);
	await waitForLoginPrompt(expect, output);
	// Expires inside the 5-minute refresh margin.
	auth0.approve({ expiresIn: 60 });
	expect((await login).exitCode, output()).toBe(0);

	const { stderr, exitCode } = await prismic("whoami");
	expect(exitCode, stderr).toBe(0);
	const grants = auth0.requestsTo("/oauth/token").map((params) => params.grant_type);
	expect(grants.filter((grant) => grant === "refresh_token")).toHaveLength(1);
	const credentials = await readFile(new URL(".config/prismic/credentials.json", home), "utf8");
	// The `exec` fixture keeps Linux off the keyring, so its logins go to this file.
	if (process.platform !== "linux") expect(credentials).not.toContain(token);
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

// Some agent sandboxes can't write to the home folder. Folder modes don't
// apply on Windows or to root.
it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
	"works in a config folder it can't write, until the token expires",
	async ({ expect, home, prismic, login, auth0 }) => {
		const configDir = new URL(".config/prismic/", home);
		const { email } = await login({ expiresAt: Date.now() + 60_000 });
		await chmod(configDir, 0o500);
		try {
			const fresh = await prismic("whoami");
			expect(fresh.exitCode, fresh.stderr).toBe(0);
			expect(fresh.stdout).toContain(email);
			// A refresh it can't save would lose the new refresh token.
			expect(auth0.requestsTo("/oauth/token")).toHaveLength(0);

			await chmod(configDir, 0o700);
			await login({ expiresAt: Date.now() - 1000 });
			await chmod(configDir, 0o500);
			const expired = await prismic("whoami");
			expect(expired.exitCode).toBe(1);
			expect(expired.stderr).toContain(
				"Set PRISMIC_CONFIG_DIR to a private folder outside your project.",
			);
		} finally {
			await chmod(configDir, 0o700);
		}
	},
);
