import { writeFile } from "node:fs/promises";

import { captureOutput, completeLogin, it } from "./it";
import { createWebhook } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("webhook", ["list", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic webhook list [options]");
});

it("lists webhooks", async ({ expect, prismic, repo, token, host }) => {
	const url = `https://example.com/test-${crypto.randomUUID()}`;

	await createWebhook(url, { repo, token, host });

	const { stdout, stderr, exitCode } = await prismic("webhook", ["list"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(url);
});

it("lists webhooks as JSON", async ({ expect, prismic, repo, token, host }) => {
	const url = `https://example.com/test-${crypto.randomUUID()}`;

	await createWebhook(url, { repo, token, host });

	const { stdout, stderr, exitCode } = await prismic("webhook", ["list", "--json"]);
	expect(exitCode, stderr).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(expect.arrayContaining([expect.objectContaining({ url })]));
});

it("logs in again and continues when the repository rejects the token", async ({
	expect,
	prismic,
	home,
	host,
	token,
}) => {
	await writeFile(
		new URL(".config/prismic/credentials.json", home),
		JSON.stringify({ token: "expired-token", host }),
	);
	const proc = prismic("webhook", ["list"], { nodeOptions: { env: { CI: "" } } });
	await completeLogin(expect, captureOutput(proc), token);
	const { stderr, exitCode } = await proc;
	expect(exitCode, stderr).toBe(0);
});
