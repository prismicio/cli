import { it } from "./it";
import { createAccessToken, createWriteToken, getAccessTokens, getWriteTokens } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("token", ["delete", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic token delete <token> [options]");
});

it("deletes an access token", async ({ expect, prismic, repo, token, host }) => {
	const created = await createAccessToken({ repo, token, host });

	const { stdout, exitCode } = await prismic("token", ["delete", created.token]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Token deleted");

	const apps = await getAccessTokens({ repo, token, host });
	const allAuths = apps.flatMap((a) => a.wroom_auths);
	expect(allAuths.find((a) => a.token === created.token)).toBeUndefined();
});

it("deletes a write token", async ({ expect, prismic, repo, token, host }) => {
	const created = await createWriteToken({ repo, token, host });

	const { stdout, exitCode } = await prismic("token", ["delete", created.token]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Token deleted");

	const writeTokensInfo = await getWriteTokens({ repo, token, host });
	expect(writeTokensInfo.tokens.find((t) => t.token === created.token)).toBeUndefined();
});
