import { it } from "./it";
import { getAccessTokens, getWriteTokens } from "./prismic";

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

	const apps = await getAccessTokens({ repo, token, host });
	const app = apps.find((a) => a.name === "Prismic CLI");
	expect(app).toBeDefined();
	const auth = app!.wroom_auths.find((a) => a.token === createdToken);
	expect(auth).toBeDefined();
});

it("creates an access token with --allow-releases", async ({
	expect,
	prismic,
	repo,
	token,
	host,
}) => {
	const { stdout, exitCode } = await prismic("token", ["create", "--allow-releases"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Token created:");

	const createdToken = stdout.replace("Token created:", "").trim();

	const apps = await getAccessTokens({ repo, token, host });
	const app = apps.find((a) => a.name === "Prismic CLI");
	expect(app).toBeDefined();
	const auth = app!.wroom_auths.find((a) => a.token === createdToken);
	expect(auth).toBeDefined();
	expect(auth!.scope).toBe("master+releases");
});

it("creates a write token", async ({ expect, prismic, repo, token, host }) => {
	const { stdout, exitCode } = await prismic("token", ["create", "--write"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Token created:");

	const createdToken = stdout.replace("Token created:", "").trim();

	const writeTokensInfo = await getWriteTokens({ repo, token, host });
	const found = writeTokensInfo.tokens.find((t) => t.token === createdToken);
	expect(found).toBeDefined();
});

it("errors when combining --write and --allow-releases", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("token", ["create", "--write", "--allow-releases"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("--allow-releases is only valid for access tokens");
});
