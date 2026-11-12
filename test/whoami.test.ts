import { randomBytes } from "node:crypto";
import { mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";

import { approveLogin, captureOutput, it, security } from "./it";

const DECRYPT_ERROR = "Your Prismic login can't be decrypted. Run `prismic login` again.";

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

it("refreshes a login about to expire once, even for parallel commands", async ({
	expect,
	prismic,
	login,
	auth0,
}) => {
	// The fake Auth0 refreshes to the e2e token, which must differ from the
	// saved one for the other commands to see a new token.
	const { email } = await login({ accessToken: "stale-token", expiresAt: Date.now() + 60_000 });
	const results = await Promise.all(Array.from({ length: 10 }, () => prismic("whoami")));
	for (const { stdout, stderr, exitCode } of results) {
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain(email);
	}
	const refreshes = auth0.requests.filter(
		(request) => request.params.grant_type === "refresh_token",
	);
	expect(refreshes).toHaveLength(1);
});

it("uses the saved token while Auth0 can't be reached, until it expires", async ({
	expect,
	prismic,
	login,
	auth0,
}) => {
	const { email } = await login({ expiresAt: Date.now() + 60_000 });
	auth0.respondOnce("/oauth/token", { status: 503 });
	const unexpired = await prismic("whoami");
	expect(unexpired.exitCode, unexpired.stderr).toBe(0);
	expect(unexpired.stdout).toContain(email);

	await login({ expiresAt: Date.now() - 1000 });
	auth0.respondOnce("/oauth/token", { status: 503 });
	const expired = await prismic("whoami");
	expect(expired.exitCode).toBe(1);
	expect(expired.stderr).toContain(
		"Can't reach the Prismic login service. Check your connection, then run the command again.",
	);
});

// Linux CI has no keychain, so its logins are plain files.
it.skipIf(process.platform === "linux")(
	"reports a saved login it can't decrypt, until a new login",
	async ({ expect, home, prismic, logout, auth0 }) => {
		await logout();
		const logIn = async () => {
			const proc = prismic("login");
			await approveLogin(expect, captureOutput(proc), auth0);
			expect((await proc).exitCode).toBe(0);
		};
		await logIn();

		const encrypted = new URL(".config/prismic/credentials.enc", home);
		const data = await readFile(encrypted);
		data[data.length - 1] ^= 1;
		await writeFile(encrypted, data);
		expect((await prismic("whoami")).stderr).toContain(DECRYPT_ERROR);

		if (process.platform === "darwin") {
			const { stdout } = await security(home, ["find-generic-password", "-s", "prismic-cli"]);
			const account = stdout.match(/"acct"<blob>="([^"]+)"/)?.[1];
			expect(account).toBeDefined();
			const wrongKey = randomBytes(32).toString("base64");
			const args = ["-s", "prismic-cli", "-a", account!];
			await security(home, ["add-generic-password", "-U", ...args, "-w", wrongKey]);
			expect((await prismic("whoami")).stderr).toContain(DECRYPT_ERROR);
			await security(home, ["delete-generic-password", ...args]);
			expect((await prismic("whoami")).stderr).toContain(DECRYPT_ERROR);
		}

		await logIn();
		expect((await prismic("whoami")).exitCode).toBe(0);
	},
	60_000,
);

it("keeps the host of a login saved by an older version, but not its token", async ({
	expect,
	home,
	prismic,
	logout,
	token,
}) => {
	await logout();
	const path = new URL(".config/prismic/credentials.json", home);
	await writeFile(path, JSON.stringify({ token, host: "prismic.io" }), { mode: 0o644 });
	const { stderr, exitCode } = await prismic("whoami");
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Not logged in. Run `prismic login` first.");
	if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
	expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ host: "prismic.io" });
});

it.skipIf(process.platform === "win32")(
	"refuses a saved login that is a symbolic link",
	async ({ expect, home, prismic, logout }) => {
		await logout();
		const configDir = new URL(".config/prismic/", home);
		await mkdir(configDir, { recursive: true });
		await writeFile(new URL("elsewhere.json", home), "{}");
		await symlink(new URL("elsewhere.json", home), new URL("credentials.json", configDir));
		const { stderr, exitCode } = await prismic("whoami");
		expect(exitCode).toBe(1);
		expect(stderr).toContain("because it's a symbolic link");
	},
);
