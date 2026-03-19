import { it } from "./it";
import { createWebhook } from "./prismic";

const PRISMIC_HOST = process.env.PRISMIC_HOST ?? "prismic.io";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("webhook", ["view", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic webhook view <url> [flags]");
});

it("views webhook details", async ({ expect, prismic, repo, token }) => {
	const url = `https://example.com/test-${crypto.randomUUID().split("-")[0]}`;
	const config = { repo, token, host: PRISMIC_HOST };

	await createWebhook(url, config);

	const { stdout, exitCode } = await prismic("webhook", ["view", url]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`URL:     ${url}`);
	expect(stdout).toContain("Status:");
	expect(stdout).toContain("Triggers:");
});
