import { it } from "./it";
import { createWebhook, getWebhooks } from "./prismic";

const PRISMIC_HOST = process.env.PRISMIC_HOST ?? "prismic.io";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("webhook", ["remove", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic webhook remove <url> [flags]");
});

it("removes a webhook", async ({ expect, prismic, repo, token }) => {
	const url = `https://example.com/test-${crypto.randomUUID()}`;
	const config = { repo, token, host: PRISMIC_HOST };

	await createWebhook(url, config);

	const { stdout, exitCode } = await prismic("webhook", ["remove", url]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Webhook removed: ${url}`);

	const webhooks = await getWebhooks(config);
	const webhook = webhooks.find((w) => w.config.url === url);
	expect(webhook).toBeUndefined();
});
