import { it } from "./it";
import { createAccessToken, createWriteToken, getAccessTokens, getWriteTokens } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("token", ["delete", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic token delete <token> [options]");
});

it("shows the AGENTS text in help only when an agent is detected", async ({ expect, prismic }) => {
	const agentHelp = (
		await prismic("token", ["delete", "--help"], {
			nodeOptions: { env: { AI_AGENT: "test-agent" } },
		})
	).stdout;
	const humanHelp = (await prismic("token", ["delete", "--help"])).stdout;
	expect(agentHelp).toContain("asked to force it, ask before you run it.");
	expect(agentHelp.indexOf("asked to force it, ask before you run it.")).toBeLessThan(
		agentHelp.indexOf("USAGE"),
	);
	expect(humanHelp).not.toContain("AGENTS");
	expect(humanHelp).not.toContain("asked to force it, ask before you run it.");
});

it("deletes an access token", async ({ expect, prismic, repo, token, host }) => {
	const created = await createAccessToken({ repo, token, host });

	const { stdout, stderr, exitCode } = await prismic("token", ["delete", created.token]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Token deleted");

	const apps = await getAccessTokens({ repo, token, host });
	const allAuths = apps.flatMap((a) => a.wroom_auths);
	expect(allAuths.find((a) => a.token === created.token)).toBeUndefined();
});

// Wroom 500s under concurrent same-user write-token creates; keep this sequential.
it(
	"deletes a write token",
	{ concurrent: false },
	async ({ expect, prismic, repo, token, host }) => {
		const created = await createWriteToken({ repo, token, host });

		const { stdout, stderr, exitCode } = await prismic("token", ["delete", created.token]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain("Token deleted");

		const writeTokensInfo = await getWriteTokens({ repo, token, host });
		expect(writeTokensInfo.tokens.find((t) => t.token === created.token)).toBeUndefined();
	},
);
