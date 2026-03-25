import { it } from "./it";
import { createAccessToken, deleteAccessToken } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("token", ["list", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic token list [options]");
});

it("lists tokens", async ({ expect, prismic, repo, token, host }) => {
	const created = await createAccessToken({ repo, token, host });

	try {
		const { stdout, exitCode } = await prismic("token", ["list"]);
		expect(exitCode).toBe(0);
		expect(stdout).toContain(created.token);
	} finally {
		await deleteAccessToken(created.authId, { repo, token, host });
	}
});

it("lists tokens as JSON", async ({ expect, prismic, repo, token, host }) => {
	const created = await createAccessToken({ repo, token, host });

	try {
		const { stdout, exitCode } = await prismic("token", ["list", "--json"]);
		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveProperty("accessTokens");
		expect(parsed).toHaveProperty("writeTokens");
		expect(parsed.accessTokens).toEqual(
			expect.arrayContaining([expect.objectContaining({ token: created.token })]),
		);
	} finally {
		await deleteAccessToken(created.authId, { repo, token, host });
	}
});
