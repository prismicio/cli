import { it } from "./it";
import { createWebhook } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("webhook", ["view", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic webhook view <url> [options]");
});

it("views webhook details", async ({ expect, prismic, repo, token, host }) => {
	const url = `https://example.com/test-${crypto.randomUUID()}`;

	await createWebhook(url, { repo, token, host });

	const { stdout, stderr, exitCode } = await prismic("webhook", ["view", url]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`URL:     ${url}`);
	expect(stdout).toContain("Status:");
	expect(stdout).toContain("Triggers:");
});
