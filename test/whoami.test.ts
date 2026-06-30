import { mkdir, writeFile } from "node:fs/promises";

import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("whoami", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic whoami [options]");
});

it("prints email of logged-in user", async ({ expect, prismic, login }) => {
	const { email } = await login();
	const { stdout, exitCode } = await prismic("whoami");
	expect(exitCode).toBe(0);
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

it("reports stored token auth failure", async ({ expect, prismic, home }) => {
	const configDir = new URL(".config/prismic/", home);
	await mkdir(configDir, { recursive: true });
	await writeFile(
		new URL("credentials.json", configDir),
		JSON.stringify({ token: "invalid-token", host: "prismic.io" }),
	);

	const { stderr, exitCode } = await prismic("whoami");
	expect(exitCode).not.toBe(0);
	expect(stderr).toContain("You do not have access to this repository.");
});

it("uses PRISMIC_TOKEN env var when set", async ({ expect, prismic, login, logout, token }) => {
	const { email } = await login();
	await logout();
	const { stdout, exitCode } = await prismic("whoami", [], {
		nodeOptions: { env: { PRISMIC_TOKEN: token } },
	});
	expect(exitCode).toBe(0);
	expect(stdout).toContain(email);
});
