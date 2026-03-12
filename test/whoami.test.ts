import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("whoami", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("USAGE");
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
