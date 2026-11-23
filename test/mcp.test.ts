import { it } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("mcp");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic mcp <command> [options]");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("mcp", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic mcp <command> [options]");
});
