import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("mcp", ["call", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic mcp call <name> [options]");
});

it("calls a tool", async ({ expect, prismic, repo }) => {
	const input = JSON.stringify({ repository: repo });
	const { stdout, stderr, exitCode } = await prismic("mcp", [
		"call",
		"list_locales",
		"--input",
		input,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("en-us");
});

it("reads the input from stdin", async ({ expect, prismic, repo }) => {
	const proc = prismic("mcp", ["call", "list_locales", "--input", "-"]);
	proc.process?.stdin?.end(JSON.stringify({ repository: repo }));
	const { stdout, stderr, exitCode } = await proc;
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("en-us");
});

it("fails when the tool returns an error", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("mcp", ["call", "list_locales"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("repository");
});
