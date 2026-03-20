import { it } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("webhook");
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic webhook <command> [flags]");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("webhook", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic webhook <command> [flags]");
});
