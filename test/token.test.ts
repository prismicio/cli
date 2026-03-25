import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("token", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic token <command> [options]");
});

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("token");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic token <command> [options]");
});
