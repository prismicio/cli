import { it } from "./it";
import { deleteAccessToken, deleteWriteToken, getAccessTokens, getWriteTokens } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("token", ["create", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic token create [options]");
});

it("creates an access token", async ({ expect, prismic, repo, token, host }) => {
	const { stdout, exitCode } = await prismic("token", ["create"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Token created:");

	const createdToken = stdout.replace("Token created:", "").trim();

	try {
		const apps = await getAccessTokens({ repo, token, host });
		const app = apps.find((a) => a.name === "Prismic CLI");
		expect(app).toBeDefined();
		const auth = app!.wroom_auths.find((a) => a.token === createdToken);
		expect(auth).toBeDefined();
	} finally {
		const apps = await getAccessTokens({ repo, token, host });
		const app = apps.find((a) => a.name === "Prismic CLI");
		const auth = app?.wroom_auths.find((a) => a.token === createdToken);
		if (auth) await deleteAccessToken(auth.id, { repo, token, host });
	}
});

it("creates a write token", async ({ expect, prismic, repo, token, host }) => {
	const { stdout, exitCode } = await prismic("token", ["create", "-w"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Token created:");

	const createdToken = stdout.replace("Token created:", "").trim();

	try {
		const writeTokensInfo = await getWriteTokens({ repo, token, host });
		const found = writeTokensInfo.tokens.find((t) => t.token === createdToken);
		expect(found).toBeDefined();
	} finally {
		await deleteWriteToken(createdToken, { repo, token, host });
	}
});
