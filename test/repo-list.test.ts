import { mkdir, writeFile } from "node:fs/promises";

import type { Result } from "tinyexec";
import type { ExpectStatic } from "vitest";

import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["list", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic repo list [options]");
});

it("lists repositories", async ({ expect, prismic, repo }) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["list"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(repo);
});

it("lists repositories as JSON", async ({ expect, prismic, repo }) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["list", "--json"]);
	expect(exitCode, stderr).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(expect.arrayContaining([expect.objectContaining({ domain: repo })]));
});

it("lists the one repository a Write API token can write to", async ({
	expect,
	prismic,
	repo,
	host,
	writeToken,
}) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["list", "--json"], {
		nodeOptions: { env: { PRISMIC_TOKEN: writeToken } },
	});
	expect(exitCode, stderr).toBe(0);
	const parsed: unknown = JSON.parse(stdout);
	expect(parsed).toEqual([
		{
			domain: repo,
			name: expect.any(String),
			role: expect.any(String),
			url: `https://${repo}.${host}/`,
		},
	]);
});

it("logs in and continues when not logged in, keeping JSON output clean", async ({
	expect,
	prismic,
	logout,
	token,
	repo,
}) => {
	await logout();
	const proc = prismic("repo", ["list", "--json"], { nodeOptions: { env: { CI: "" } } });
	const { stdout, stderr, exitCode } = await completeLogin(expect, proc, token);
	expect(exitCode, stderr).toBe(0);
	expect(stderr).toContain("You are not logged in.");
	expect(stderr).toContain("Open this URL to log in:");
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(expect.arrayContaining([expect.objectContaining({ domain: repo })]));
});

it("logs in again and continues when the login expired", async ({
	expect,
	prismic,
	home,
	host,
	token,
	repo,
}) => {
	const configDir = new URL(".config/prismic/", home);
	await mkdir(configDir, { recursive: true });
	await writeFile(
		new URL("credentials.json", configDir),
		JSON.stringify({ token: "expired-token", host }),
	);
	const proc = prismic("repo", ["list"], { nodeOptions: { env: { CI: "" } } });
	const { stdout, stderr, exitCode } = await completeLogin(expect, proc, token);
	expect(exitCode, stderr).toBe(0);
	expect(stderr).toContain("Your login expired.");
	expect(stdout).toContain(repo);
});

it("fails without a login when not logged in on CI", async ({ expect, prismic, logout }) => {
	await logout();
	const { stdout, stderr, exitCode } = await prismic("repo", ["list"], {
		nodeOptions: { env: { CI: "true" } },
	});
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Not logged in. Run `prismic login` first.");
	expect(stdout + stderr).not.toContain("Open this URL to log in");
});

// Completes the login the command prints on stderr, then returns its output.
async function completeLogin(
	expect: ExpectStatic,
	proc: Result,
	token: string,
): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }> {
	let stdout = "";
	let stderr = "";
	proc.process?.stdout?.on("data", (chunk: Buffer) => (stdout += chunk));
	proc.process?.stderr?.on("data", (chunk: Buffer) => (stderr += chunk));
	await expect.poll(() => stderr, { timeout: 15_000 }).toMatch(/port=\d+/);
	const port = stderr.match(/port=(\d+)/)![1];
	await fetch(`http://localhost:${port}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ cookies: [`prismic-auth=${token}; path=/`], email: "test@example.com" }),
	});
	const { exitCode } = await proc;
	return { stdout, stderr, exitCode };
}
