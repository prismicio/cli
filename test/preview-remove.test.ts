import { it } from "./it";
import { addPreview, getPreviews } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("preview", ["remove", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic preview remove <url> [options]");
});

it("removes a preview", async ({ expect, prismic, repo, token, host }) => {
	const previewUrl = `https://test-${crypto.randomUUID()}.example.com/api/preview`;

	await addPreview(previewUrl, "Test Preview", { repo, token, host });

	const { stdout, stderr, exitCode } = await prismic("preview", ["remove", previewUrl]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Preview removed: ${previewUrl}`);

	const previews = await getPreviews({ repo, token, host });
	const preview = previews.find((p) => p.url === previewUrl);
	expect(preview).toBeUndefined();
});
