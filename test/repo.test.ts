import { it } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("repo");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic repo <command> [options]");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("repo", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic repo <command> [options]");
});
