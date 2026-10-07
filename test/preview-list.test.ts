import { it } from "./it";
import { addPreview } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("preview", ["list", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic preview list [options]");
});

it("lists previews", async ({ expect, prismic, repo, token, host }) => {
	const previewUrl = `https://test-${crypto.randomUUID()}.example.com/api/preview`;

	await addPreview(previewUrl, "Test Preview", { repo, token, host });

	const { stdout, stderr, exitCode } = await prismic("preview", ["list"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(previewUrl);
});

it("lists previews as JSON", async ({ expect, prismic, repo, token, host }) => {
	const previewUrl = `https://test-${crypto.randomUUID()}.example.com/api/preview`;

	await addPreview(previewUrl, "Test Preview", { repo, token, host });

	const { stdout, stderr, exitCode } = await prismic("preview", ["list", "--json"]);
	expect(exitCode, stderr).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed.previews).toEqual(
		expect.arrayContaining([expect.objectContaining({ url: previewUrl })]),
	);
	expect(parsed).toHaveProperty("simulatorUrl");
});

it("rejects a Write API token", async ({ expect, prismic, writeToken }) => {
	const { stderr, exitCode } = await prismic("preview", ["list"], {
		nodeOptions: { env: { PRISMIC_TOKEN: writeToken } },
	});
	expect(exitCode).not.toBe(0);
	expect(stderr).toContain("This token cannot run administrative commands.");
});
