import { it } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("slice");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic slice <command> [options]");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("slice", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic slice <command> [options]");
});
