import { it } from "./it";

const DAY_MS = 24 * 60 * 60 * 1000;

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("open", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic open [options]");
});

it("prints a link that opens the temporary account", async ({ expect, prismic, login }) => {
	await login({ guest: { claimUrl: "https://example.com/claim", expiresAt: Date.now() + DAY_MS } });
	const { stdout, stderr, exitCode } = await prismic("open");
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toMatch(
		/Open this link within 10 minutes\. It works once:\n {2}http:\/\/127\.0\.0\.1:\d+\/authentication\/guest\/login\?t=/,
	);
});

it("fails for an account that signed up", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("open");
	expect(exitCode).toBe(1);
	expect(stderr).toContain("works only for an account started without signing up");
});

it("says the temporary account was claimed, and logs out", async ({ expect, prismic, login }) => {
	await login({
		expiresAt: Date.now() - 1000,
		refreshToken: "deleted-by-claim",
		guest: { claimUrl: "https://example.com/claim", expiresAt: Date.now() + DAY_MS },
	});
	const { stderr, exitCode } = await prismic("open");
	expect(exitCode).toBe(1);
	expect(stderr).toContain(
		"Your temporary account was claimed, with its repositories. Run `prismic login` with the account that claimed it to keep working.",
	);
	expect(stderr).not.toContain("temporary Prismic account");
	expect((await prismic("whoami")).stderr).toContain("Not logged in.");
});

it("says the temporary account expired, and logs out", async ({ expect, prismic, login }) => {
	await login({
		expiresAt: Date.now() - 1000,
		refreshToken: "deleted-by-cleanup",
		guest: { claimUrl: "https://example.com/claim", expiresAt: Date.now() - DAY_MS },
	});
	const { stderr, exitCode } = await prismic("open");
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Your temporary account expired, and Prismic deleted its repositories.");
	expect((await prismic("whoami")).stderr).toContain("Not logged in.");
});
