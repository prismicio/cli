import { it } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("field");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic field <command> [options]");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("field", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic field <command> [options]");
});
