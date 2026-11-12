import { readFile } from "node:fs/promises";

import { approveLogin, captureOutput, it, security } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("logout", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic logout [options]");
});

it("revokes the session, and deletes the login and its key but keeps the host", async ({
	expect,
	home,
	host,
	prismic,
	logout,
	auth0,
}) => {
	await logout();
	const login = prismic("login");
	await approveLogin(expect, captureOutput(login), auth0);
	expect((await login).exitCode).toBe(0);

	const { stdout, stderr, exitCode } = await prismic("logout");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Logged out of Prismic");
	expect(auth0.requests.filter((request) => request.path === "/oauth/revoke")).toHaveLength(1);

	const configDir = new URL(".config/prismic/", home);
	const credentials = JSON.parse(await readFile(new URL("credentials.json", configDir), "utf8"));
	expect(credentials).toEqual({ host });
	await expect(readFile(new URL("credentials.enc", configDir))).rejects.toThrow();
	if (process.platform === "darwin") {
		// 44 means the item isn't found.
		const { exitCode } = await security(home, ["find-generic-password", "-s", "prismic-cli"]);
		expect(exitCode).toBe(44);
	}

	const whoami = await prismic("whoami");
	expect(whoami.stderr).toContain("Not logged in. Run `prismic login` first.");
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
		"Couldn't revoke your session because the login service can't be reached. It stays valid until it expires.",
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
