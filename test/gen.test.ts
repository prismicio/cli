import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("gen", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic gen <command> [options]");
});

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("gen");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic gen <command> [options]");
});
