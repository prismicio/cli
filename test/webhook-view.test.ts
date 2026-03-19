import { it } from "./it";
import { createWebhook } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("webhook", ["view", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic webhook view <url> [flags]");
});

it("views webhook details", async ({ expect, prismic, repo, token, host }) => {
	const url = `https://example.com/test-${crypto.randomUUID()}`;

	await createWebhook(url, { repo, token, host });

	const { stdout, exitCode } = await prismic("webhook", ["view", url]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`URL:     ${url}`);
	expect(stdout).toContain("Status:");
	expect(stdout).toContain("Triggers:");
});
