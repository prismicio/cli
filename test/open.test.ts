import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { it } from "./it";

const DAY_MS = 24 * 60 * 60 * 1000;

// Records the URL instead of opening a browser. Windows opens it with a shell
// builtin, which PATH can't replace.
async function stubBrowser(bin: URL): Promise<() => Promise<string>> {
	const log = new URL("opened.txt", bin);
	for (const name of ["open", "xdg-open"]) {
		await writeFile(new URL(name, bin), `#!/bin/sh\necho "$1" >> "${fileURLToPath(log)}"\n`, {
			mode: 0o755,
		});
	}
	return () => readFile(log, "utf8").catch(() => "");
}

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("open", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic open [options]");
});

it.skipIf(process.platform === "win32")(
	"opens the project's repository",
	async ({ expect, prismic, bin, repo, host }) => {
		const opened = await stubBrowser(bin);
		const { stdout, stderr, exitCode } = await prismic("open");
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain(`Opening https://${repo}.${host}/`);
		await expect.poll(opened).toContain(`https://${repo}.${host}/`);
	},
);

it.skipIf(process.platform === "win32")(
	"opens the dashboard with --dashboard",
	async ({ expect, prismic, bin, host }) => {
		const opened = await stubBrowser(bin);
		const { stdout, stderr, exitCode } = await prismic("open", ["--dashboard"]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain(`Opening https://${host}/dashboard`);
		await expect.poll(opened).toContain(`https://${host}/dashboard`);
	},
);

it("opens a temporary account logged in, on the project's repository", async ({
	expect,
	prismic,
	login,
	repo,
	host,
}) => {
	await login({ guest: { claimUrl: "https://example.com/claim", expiresAt: Date.now() + DAY_MS } });
	const { stdout, stderr, exitCode } = await prismic("open");
	expect(exitCode, stderr).toBe(0);
	const url = new URL(stdout.match(/Opening (\S+)/)![1]);
	expect(url.pathname).toBe("/authentication/guest/login");
	expect(url.searchParams.get("redirect_uri")).toBe(`https://${repo}.${host}/`);
});

it("opens a temporary account logged in, on the dashboard with --dashboard", async ({
	expect,
	prismic,
	login,
}) => {
	await login({ guest: { claimUrl: "https://example.com/claim", expiresAt: Date.now() + DAY_MS } });
	const { stdout, stderr, exitCode } = await prismic("open", ["--dashboard"]);
	expect(exitCode, stderr).toBe(0);
	const url = new URL(stdout.match(/Opening (\S+)/)![1]);
	expect(url.pathname).toBe("/authentication/guest/login");
	expect(url.searchParams.has("redirect_uri")).toBe(false);
});

it.skipIf(process.platform === "win32")(
	"opens a temporary account logged out when Prismic refuses the target",
	async ({ expect, prismic, login, auth0, bin, repo, host }) => {
		const opened = await stubBrowser(bin);
		await login({
			guest: { claimUrl: "https://example.com/claim", expiresAt: Date.now() + DAY_MS },
		});
		auth0.respondOnce("/authentication/guest/magic-link", {
			status: 400,
			body: { error: "invalid_redirect_uri" },
		});
		const { stdout, stderr, exitCode } = await prismic("open");
		expect(exitCode, stderr).toBe(0);
		expect(stderr).toContain(
			`Prismic can't open https://${repo}.${host}/ logged in (invalid_redirect_uri), so it opens logged out.`,
		);
		expect(stdout).toContain(`Opening https://${repo}.${host}/`);
		await expect.poll(opened).toContain(`https://${repo}.${host}/`);
	},
);

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
	expect(stderr).not.toContain("Keep it:");
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
