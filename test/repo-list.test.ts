import { writeFile } from "node:fs/promises";

import { captureOutput, completeLogin, it } from "./it";

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
	const proc = prismic("repo", ["list", "--json"], { nodeOptions: { env: { CI: "" } } });
	const output = captureOutput(proc);
	await completeLogin(expect, output, token);
	const { stdout, exitCode } = await proc;
	expect(exitCode, output()).toBe(0);
	expect(output()).toContain("Log in to continue: https://");
	expect(JSON.parse(stdout)).toEqual(
		expect.arrayContaining([expect.objectContaining({ domain: repo })]),
	);
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
	await completeLogin(expect, captureOutput(proc), token);
	const { stdout, stderr, exitCode } = await proc;
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(repo);
});
