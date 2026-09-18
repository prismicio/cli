import { writeFile } from "node:fs/promises";

import { it } from "./it";
import { getPreviews } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("preview", ["add", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic preview add <url> [options]");
});

it("adds a preview", async ({ expect, prismic, repo, token, host }) => {
	const previewUrl = `https://test-${crypto.randomUUID()}.example.com/api/preview`;

	const { stdout, stderr, exitCode } = await prismic("preview", ["add", previewUrl]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Preview added: ${previewUrl}`);

	const previews = await getPreviews({ repo, token, host });
	const preview = previews.find((p) => p.url === previewUrl);
	expect(preview).toBeDefined();
});

it("adds a preview with a custom name", async ({ expect, prismic, repo, token, host }) => {
	const previewUrl = `https://test-${crypto.randomUUID()}.example.com/api/preview`;

	const { stdout, stderr, exitCode } = await prismic("preview", [
		"add",
		previewUrl,
		"--name",
		"My Preview",
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Preview added: ${previewUrl}`);

	const previews = await getPreviews({ repo, token, host });
	const preview = previews.find((p) => p.url === previewUrl);
	expect(preview?.label).toBe("My Preview");
});

it("prints instructions for adding the preview component", async ({ expect, prismic }) => {
	const previewUrl = `https://test-${crypto.randomUUID()}.example.com/api/preview`;

	const { stdout, stderr, exitCode } = await prismic("preview", ["add", previewUrl]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("add <PrismicPreview> to your root layout");
});

it("skips the preview component instructions when the project renders it", async ({
	expect,
	project,
	prismic,
}) => {
	await writeFile(new URL("app/layout.jsx", project), '<PrismicPreview repositoryName="a" />');
	const previewUrl = `https://test-${crypto.randomUUID()}.example.com/api/preview`;

	const { stdout, stderr, exitCode } = await prismic("preview", ["add", previewUrl]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Preview added: ${previewUrl}`);
	expect(stdout).not.toContain("PrismicPreview");
});
