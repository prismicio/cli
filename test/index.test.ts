import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("USAGE");
});

it("prints help text by default", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("USAGE");
});
