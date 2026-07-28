import { it } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("env");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic env <command> [options]");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("env", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic env <command> [options]");
});
