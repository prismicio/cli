import { it } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("webhook");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic webhook <command> [options]");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("webhook", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic webhook <command> [options]");
});
