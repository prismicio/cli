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

	const createdToken = stdout.match(/Token created: (.+)/)?.[1];
	expect(createdToken).toBeDefined();

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

	const createdToken = stdout.match(/Token created: (.+)/)?.[1];
	expect(createdToken).toBeDefined();

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

	const createdToken = stdout.match(/Token created: (.+)/)?.[1];
	expect(createdToken).toBeDefined();

	const writeTokensInfo = await getWriteTokens({ repo, token, host });
	const found = writeTokensInfo.tokens.find((t) => t.token === createdToken);
	expect(found).toBeDefined();
});

it("creates a write token with a custom --name", async ({ expect, prismic, repo, token, host }) => {
	const { stdout, exitCode } = await prismic("token", [
		"create",
		"--write",
		"--name",
		"My Seed Token",
	]);
	expect(exitCode).toBe(0);

	const createdToken = stdout.match(/Token created: (.+)/)?.[1];
	expect(createdToken).toBeDefined();

	const writeTokensInfo = await getWriteTokens({ repo, token, host });
	const found = writeTokensInfo.tokens.find((t) => t.token === createdToken);
	expect(found).toBeDefined();
	expect(found!.app_name).toBe("My Seed Token");
});

it("outputs a write token as JSON with --json", async ({ expect, prismic, repo, token, host }) => {
	const { stdout, exitCode } = await prismic("token", ["create", "--write", "--json"]);
	expect(exitCode).toBe(0);

	const result = JSON.parse(stdout);
	expect(result.type).toBe("write");
	expect(result.name).toBe("Prismic CLI");
	expect(result.repository).toBe(repo);
	expect(result.token).toBeDefined();

	const writeTokensInfo = await getWriteTokens({ repo, token, host });
	const found = writeTokensInfo.tokens.find((t) => t.token === result.token);
	expect(found).toBeDefined();
});

it("outputs an access token as JSON with --json", async ({ expect, prismic, repo }) => {
	const { stdout, exitCode } = await prismic("token", ["create", "--json"]);
	expect(exitCode).toBe(0);

	const result = JSON.parse(stdout);
	expect(result.type).toBe("access");
	expect(result.scope).toBe("master");
	expect(result.repository).toBe(repo);
	expect(result.token).toBeDefined();
});

it("errors when combining --write and --allow-releases", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("token", ["create", "--write", "--allow-releases"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("--allow-releases is only valid for access tokens");
});
