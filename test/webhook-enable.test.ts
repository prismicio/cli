import { it } from "./it";
import { createWebhook, getWebhooks } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("webhook", ["enable", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic webhook enable <url> [flags]");
});

it("enables a disabled webhook", async ({ expect, prismic, repo, token, host }) => {
	const url = `https://example.com/test-${crypto.randomUUID()}`;

	await createWebhook(url, { repo, token, host });

	// Disable the webhook first via CLI
	const disable = await prismic("webhook", ["disable", url]);
	expect(disable.exitCode).toBe(0);

	const { stdout, exitCode } = await prismic("webhook", ["enable", url]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Webhook enabled: ${url}`);

	const webhooks = await getWebhooks({ repo, token, host });
	const webhook = webhooks.find((w) => w.config.url === url);
	expect(webhook?.config.active).toBe(true);
});
