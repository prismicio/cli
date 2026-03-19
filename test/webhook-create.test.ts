import { it } from "./it";
import { getWebhooks } from "./prismic";

const PRISMIC_HOST = process.env.PRISMIC_HOST ?? "prismic.io";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("webhook", ["create", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic webhook create <url> [flags]");
});

it("creates a webhook", async ({ expect, prismic, repo, token }) => {
	const url = `https://example.com/test-${crypto.randomUUID().split("-")[0]}`;
	const config = { repo, token, host: PRISMIC_HOST };

	const { stdout, exitCode } = await prismic("webhook", ["create", url]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Webhook created: ${url}`);

	const webhooks = await getWebhooks(config);
	const webhook = webhooks.find((w) => w.config.url === url);
	expect(webhook).toBeDefined();
});
