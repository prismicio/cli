import { it } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("repo");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic repo <command> [options]");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic repo <command> [options]");
});
