import { it } from "./it";
import { createWebhook, getWebhooks } from "./prismic";

const PRISMIC_HOST = process.env.PRISMIC_HOST ?? "prismic.io";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("webhook", ["disable", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic webhook disable <url> [flags]");
});

it("disables a webhook", async ({ expect, prismic, repo, token }) => {
	const url = `https://example.com/test-${crypto.randomUUID().split("-")[0]}`;
	const config = { repo, token, host: PRISMIC_HOST };

	await createWebhook(url, config);

	const { stdout, exitCode } = await prismic("webhook", ["disable", url]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Webhook disabled: ${url}`);

	const webhooks = await getWebhooks(config);
	const webhook = webhooks.find((w) => w.config.url === url);
	expect(webhook?.config.active).toBe(false);
});
