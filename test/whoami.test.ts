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
	const { exitCode } = await prismic("whoami");
	expect(exitCode).not.toBe(0);
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
