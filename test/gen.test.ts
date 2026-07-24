import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("gen", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic gen <command> [options]");
});

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("gen");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic gen <command> [options]");
});
