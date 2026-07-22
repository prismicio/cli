import { it } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("preview");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic preview <command> [options]");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("preview", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic preview <command> [options]");
});
