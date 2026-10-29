import { writeFile } from "node:fs/promises";

import type { ExpectStatic } from "vitest";

import { captureOutput, it } from "./it";

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

it("logs in and continues when not logged in", async ({ expect, prismic, logout, token, repo }) => {
	await logout();
	const proc = prismic("repo", ["list"], { nodeOptions: { env: { CI: "" } } });
	const output = captureOutput(proc);
	await completeLogin(expect, output, token);
	const { exitCode } = await proc;
	expect(exitCode, output()).toBe(0);
	expect(output()).toContain("You are not logged in.");
	expect(output()).toContain("Open this URL to log in:");
	expect(output()).toContain(repo);
});

it("logs in again and continues when the login expired", async ({
	expect,
	prismic,
	home,
	host,
	token,
	repo,
}) => {
	await writeFile(
		new URL(".config/prismic/credentials.json", home),
		JSON.stringify({ token: "expired-token", host }),
	);
	const proc = prismic("repo", ["list"], { nodeOptions: { env: { CI: "" } } });
	const output = captureOutput(proc);
	await completeLogin(expect, output, token);
	const { exitCode } = await proc;
	expect(exitCode, output()).toBe(0);
	expect(output()).toContain("Your login expired.");
	expect(output()).toContain(repo);
});

async function completeLogin(expect: ExpectStatic, output: () => string, token: string) {
	await expect.poll(output, { timeout: 15_000 }).toMatch(/port=(\d+)/);
	const port = output().match(/port=(\d+)/)![1];
	await fetch(`http://localhost:${port}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			cookies: [`prismic-auth=${token}; path=/`],
			email: "test@example.com",
		}),
	});
}
