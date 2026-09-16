import { it } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("preview");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic preview <command> [options]");
	expect(stdout).toContain("prismic docs view previews");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("preview", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic preview <command> [options]");
	expect(stdout).toContain("prismic docs view previews");
});

it("shows how to set up both preview settings", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("preview", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("EXAMPLES");
	expect(stdout).toContain("prismic preview set-simulator");
});
