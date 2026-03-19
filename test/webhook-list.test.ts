import { it } from "./it";
import { createWebhook } from "./prismic";

const PRISMIC_HOST = process.env.PRISMIC_HOST ?? "prismic.io";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("webhook", ["list", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic webhook list [flags]");
});

it("lists webhooks", async ({ expect, prismic, repo, token }) => {
	const url = `https://example.com/test-${crypto.randomUUID().split("-")[0]}`;
	const config = { repo, token, host: PRISMIC_HOST };

	await createWebhook(url, config);

	const { stdout, exitCode } = await prismic("webhook", ["list"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(url);
});

it("lists webhooks as JSON", async ({ expect, prismic, repo, token }) => {
	const url = `https://example.com/test-${crypto.randomUUID().split("-")[0]}`;
	const config = { repo, token, host: PRISMIC_HOST };

	await createWebhook(url, config);

	const { stdout, exitCode } = await prismic("webhook", ["list", "--json"]);
	expect(exitCode).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(expect.arrayContaining([expect.objectContaining({ url })]));
});
