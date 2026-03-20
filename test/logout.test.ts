import { readFile } from "node:fs/promises";

import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("logout", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic logout [options]");
});

it("logs out and deletes auth file", async ({ expect, home, prismic }) => {
	const { stdout, exitCode } = await prismic("logout");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Logged out of Prismic");
	await expect(readFile(new URL(".prismic", home), "utf-8")).rejects.toThrow();
});

it("succeeds when not logged in", async ({ expect, prismic, logout }) => {
	await logout();
	const { stdout, exitCode } = await prismic("logout");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Logged out of Prismic");
});
