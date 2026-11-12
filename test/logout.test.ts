import { readFile } from "node:fs/promises";

import { approveLogin, captureOutput, it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("logout", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic logout [options]");
});

it("revokes the session, and deletes the login but keeps the host", async ({
	expect,
	home,
	prismic,
	logout,
	auth0,
}) => {
	await logout();
	const login = prismic("login");
	await approveLogin(expect, captureOutput(login), auth0);
	expect((await login).exitCode).toBe(0);
	const configDir = new URL(".config/prismic/", home);
	const encrypted = new URL("credentials.enc", configDir);
	// The `exec` fixture keeps Linux off the keyring, so its logins go to a file.
	if (process.platform !== "linux") await expect(readFile(encrypted)).resolves.toBeTruthy();

	const { stdout, stderr, exitCode } = await prismic("logout");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Logged out of Prismic");
	expect(auth0.requestsTo("/oauth/revoke")).toHaveLength(1);
	const credentials = JSON.parse(await readFile(new URL("credentials.json", configDir), "utf8"));
	expect(Object.keys(credentials)).toEqual(["host"]);
	await expect(readFile(encrypted)).rejects.toThrow();
});

it("logs out when the session can't be revoked, and says so", async ({
	expect,
	home,
	prismic,
	auth0,
}) => {
	auth0.respondOnce("/oauth/revoke", { status: 503 });
	const { stdout, stderr, exitCode } = await prismic("logout");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Logged out of Prismic");
	expect(stderr).toContain(
		"Couldn't revoke your session because the Prismic login service can't be reached. It stays valid until it expires.",
	);
	const credentials = await readFile(new URL(".config/prismic/credentials.json", home), "utf8");
	expect(credentials).not.toContain("accessToken");
});

it("says that PRISMIC_TOKEN still works after logging out", async ({ expect, prismic, token }) => {
	const { stderr, exitCode } = await prismic("logout", [], {
		nodeOptions: { env: { PRISMIC_TOKEN: token } },
	});
	expect(exitCode, stderr).toBe(0);
	expect(stderr).toContain("PRISMIC_TOKEN is still set, so commands still use it.");
});

it("succeeds when not logged in", async ({ expect, prismic, logout }) => {
	await logout();
	const { stdout, stderr, exitCode } = await prismic("logout");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Logged out of Prismic");
});
