import { it } from "./it";
import { createWebhook, getWebhooks } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("webhook", ["remove", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic webhook remove <url> [options]");
});

it("removes a webhook", async ({ expect, prismic, repo, token, host }) => {
	const url = `https://example.com/test-${crypto.randomUUID()}`;

	await createWebhook(url, { repo, token, host });

	const { stdout, stderr, exitCode } = await prismic("webhook", ["remove", url]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Webhook removed: ${url}`);

	const webhooks = await getWebhooks({ repo, token, host });
	const webhook = webhooks.find((w) => w.config.url === url);
	expect(webhook).toBeUndefined();
});
