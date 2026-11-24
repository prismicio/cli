import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("mcp", ["tools", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic mcp tools <name> [options]");
});

it("lists tool names", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("mcp", ["tools"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout.split("\n")).toContain("list_locales");
	expect(stdout).toContain("prismic mcp tools <name> [<name>...]");
});

it("points agents to the MCP server setup", async ({ expect, prismic }) => {
	const { stdout: taskId } = await prismic("task-id");
	const args = ["tools", "--task-id", taskId.trim(), "--user-intent", "List MCP tools"];
	const agent = { nodeOptions: { env: { AI_AGENT: "test-agent" } } };
	const { stderr, exitCode } = await prismic("mcp", args, agent);
	expect(exitCode, stderr).toBe(0);
	expect(stderr).toContain("set up the Prismic MCP server: see `prismic mcp --help`");
});

it("prints the definitions of tools", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("mcp", [
		"tools",
		"list_locales",
		"list_releases",
	]);
	expect(exitCode, stderr).toBe(0);
	const definitions = stdout
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	expect(definitions).toMatchObject([
		{ name: "list_locales", inputSchema: { properties: { repository: {} } } },
		{ name: "list_releases" },
	]);
});

it("fails for an unknown tool", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("mcp", ["tools", "unknown_tool"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Unknown tool: unknown_tool");
});

it("suggests close matches for an unknown tool", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("mcp", ["tools", "list_locale"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("list_locales");
});

it("rejects a Write API token", async ({ expect, prismic, writeToken }) => {
	const { stderr, exitCode } = await prismic("mcp", ["tools"], {
		nodeOptions: { env: { PRISMIC_TOKEN: writeToken } },
	});
	expect(exitCode).not.toBe(0);
	expect(stderr).toContain("MCP tools can't use a write API token.");
});
