import { it } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice <command> [options]");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice <command> [options]");
});
