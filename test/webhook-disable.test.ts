import { it } from "./it";
import { createWebhook, getWebhooks } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("webhook", ["disable", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic webhook disable <url> [options]");
});

it("disables a webhook", async ({ expect, prismic, repo, token, host }) => {
	const url = `https://example.com/test-${crypto.randomUUID()}`;

	await createWebhook(url, { repo, token, host });

	const { stdout, stderr, exitCode } = await prismic("webhook", ["disable", url]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Webhook disabled: ${url}`);

	const webhooks = await getWebhooks({ repo, token, host });
	const webhook = webhooks.find((w) => w.config.url === url);
	expect(webhook?.config.active).toBe(false);
});
