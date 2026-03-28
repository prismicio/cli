import { it } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field <command> [options]");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field <command> [options]");
});
