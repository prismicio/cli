import { it } from "./it";
import { getWebhooks } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("webhook", ["create", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic webhook create <url> [options]");
});

it("creates a webhook", async ({ expect, prismic, repo, token, host }) => {
	const url = `https://example.com/test-${crypto.randomUUID()}`;

	const { stdout, exitCode } = await prismic("webhook", ["create", url]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Webhook created: ${url}`);

	const webhooks = await getWebhooks({ repo, token, host });
	const webhook = webhooks.find((w) => w.config.url === url);
	expect(webhook).toBeDefined();
});
