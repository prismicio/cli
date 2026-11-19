import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("mcp", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic mcp <command> [options]");
	expect(stdout).not.toContain("AGENTS");
});

it("tells agents how to connect the MCP server", async ({ expect, prismic }) => {
	const { stdout } = await prismic("mcp", ["--help"], {
		nodeOptions: { env: { AI_AGENT: "test-agent" } },
	});
	expect(stdout).toContain("If one is connected, or you can't tell, add nothing");
	expect(stdout).toContain(
		`claude mcp add-json --scope project prismic '{"type":"http","url":"https://mcp.prismic.io/mcp","headersHelper":"npx prismic mcp token"}'`,
	);
});
