import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("mcp", ["token", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic mcp token [options]");
});

it("prints an Authorization header, even for an agent without a task ID", async ({
	expect,
	prismic,
	login,
	token,
}) => {
	await login({ expiresAt: Date.now() - 1000 });
	const { stdout, stderr, exitCode } = await prismic("mcp", ["token"], {
		nodeOptions: { env: { AI_AGENT: "test-agent" } },
	});
	expect(exitCode, stderr).toBe(0);
	expect(JSON.parse(stdout)).toEqual({ Authorization: `Bearer ${token}` });
});

it("fails when not logged in", async ({ expect, prismic, logout }) => {
	await logout();
	const { stderr, exitCode } = await prismic("mcp", ["token"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Not logged in. Run `prismic login` first.");
});
