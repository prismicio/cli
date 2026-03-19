import { it } from "./it";
import { createWebhook, getWebhooks } from "./prismic";

const PRISMIC_HOST = process.env.PRISMIC_HOST ?? "prismic.io";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("webhook", ["set-triggers", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic webhook set-triggers <url> [flags]");
});

it("updates webhook triggers", async ({ expect, prismic, repo, token }) => {
	const url = `https://example.com/test-${crypto.randomUUID()}`;
	const config = { repo, token, host: PRISMIC_HOST };

	await createWebhook(url, config);

	const { stdout, exitCode } = await prismic("webhook", [
		"set-triggers",
		url,
		"-t",
		"documentsPublished",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Webhook triggers updated: documentsPublished");

	const webhooks = await getWebhooks(config);
	const webhook = webhooks.find((w) => w.config.url === url);
	expect(webhook?.config.documentsPublished).toBe(true);
	expect(webhook?.config.documentsUnpublished).toBe(false);
	expect(webhook?.config.releasesCreated).toBe(false);
	expect(webhook?.config.releasesUpdated).toBe(false);
	expect(webhook?.config.tagsCreated).toBe(false);
	expect(webhook?.config.tagsDeleted).toBe(false);
});
