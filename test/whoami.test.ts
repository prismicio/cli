import { writeFile } from "node:fs/promises";

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

it("reads Slice Machine auth format", async ({ expect, home, project, prismic, login, logout }) => {
	const { email, token } = await login();
	await logout();

	await writeFile(
		new URL(".prismic", home),
		JSON.stringify({
			base: "https://prismic.io/",
			cookies: `prismic-auth=${token}; Path=/; SameSite=none; SESSION=fake; Path=/; SameSite=none`,
		}),
	);

	await writeFile(
		new URL("slicemachine.config.json", project),
		JSON.stringify({ repositoryName: "test" }),
	);

	const { exitCode, stdout } = await prismic("whoami");
	expect(exitCode).toBe(0);
	expect(stdout).toContain(email);
});
