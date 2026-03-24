import { it } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("locale");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic locale <command> [options]");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("locale", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic locale <command> [options]");
});
