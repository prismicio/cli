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

it("tells agents how to set up the MCP server", async ({ expect, prismic }) => {
	const agent = { nodeOptions: { env: { AI_AGENT: "test-agent" } } };
	const { stdout, stderr, exitCode } = await prismic("mcp", ["--help"], agent);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("https://mcp.prismic.io/mcp");
	expect(stdout).toContain("prefer it over `prismic mcp call`");
});
