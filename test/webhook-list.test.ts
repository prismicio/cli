import { it } from "./it";
import { createWebhook } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("webhook", ["list", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic webhook list [options]");
});

it("lists webhooks", async ({ expect, prismic, repo, token, host }) => {
	const url = `https://example.com/test-${crypto.randomUUID()}`;

	await createWebhook(url, { repo, token, host });

	const { stdout, exitCode } = await prismic("webhook", ["list"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(url);
});

it("lists webhooks as JSON", async ({ expect, prismic, repo, token, host }) => {
	const url = `https://example.com/test-${crypto.randomUUID()}`;

	await createWebhook(url, { repo, token, host });

	const { stdout, exitCode } = await prismic("webhook", ["list", "--json"]);
	expect(exitCode).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(expect.arrayContaining([expect.objectContaining({ url })]));
});
