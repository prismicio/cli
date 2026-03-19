import { it } from "./it";
import { createWebhook, getWebhooks } from "./prismic";

const PRISMIC_HOST = process.env.PRISMIC_HOST ?? "prismic.io";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("webhook", ["enable", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic webhook enable <url> [flags]");
});

it("enables a disabled webhook", async ({ expect, prismic, repo, token }) => {
	const url = `https://example.com/test-${crypto.randomUUID()}`;
	const config = { repo, token, host: PRISMIC_HOST };

	await createWebhook(url, config);

	// Disable the webhook first via CLI
	const disable = await prismic("webhook", ["disable", url]);
	expect(disable.exitCode).toBe(0);

	const { stdout, exitCode } = await prismic("webhook", ["enable", url]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Webhook enabled: ${url}`);

	const webhooks = await getWebhooks(config);
	const webhook = webhooks.find((w) => w.config.url === url);
	expect(webhook?.config.active).toBe(true);
});
