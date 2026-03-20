import { it } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("preview");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic preview <command> [flags]");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("preview", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic preview <command> [flags]");
});
