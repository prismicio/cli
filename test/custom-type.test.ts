import { it } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("custom-type");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic custom-type <command> [options]");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("custom-type", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic custom-type <command> [options]");
});
