import { captureOutput, it } from "./it";
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

it("renews a token the repository rejects, and continues without a login", async ({
	expect,
	prismic,
	login,
	auth0,
}) => {
	await login({ accessToken: "rejected-token" });
	const proc = prismic("webhook", ["list"], { nodeOptions: { env: { CI: "" } } });
	const output = captureOutput(proc);
	const { exitCode } = await proc;
	expect(exitCode, output()).toBe(0);
	expect(output()).not.toContain("Open this URL");
	const refreshes = auth0.requests.filter(
		(request) => request.params.grant_type === "refresh_token",
	);
	expect(refreshes).toHaveLength(1);
});
