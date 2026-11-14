import { mkdir, writeFile } from "node:fs/promises";

import { describe } from "vitest";

import { it, useSvelteKit } from "./it";
import { getPreviews, setSimulatorUrl } from "./prismic";

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

it("asks for a SvelteKit server layout when the project has none", async ({
	expect,
	project,
	prismic,
}) => {
	await useSvelteKit(project);
	await mkdir(new URL("src/routes/", project), { recursive: true });
	await writeFile(new URL("src/routes/+layout.svelte", project), "{@render children()}");
	const previewUrl = `https://test-${crypto.randomUUID()}.example.com/api/preview`;

	const { stdout, stderr, exitCode } = await prismic("preview", ["add", previewUrl]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("<PrismicPreview repositoryName={data.repositoryName} />");
	expect(stdout).toContain("Return repositoryName from load in src/routes/+layout.server.js");
	expect(stdout).toContain('export const prerender = "auto";');
	expect(stdout).toContain("return { repositoryName };");
});

describe("with an isolated repository", () => {
	it.scoped({ isolateRepo: true });

	it("notes a simulator URL on another host", async ({ expect, prismic, repo, token, host }) => {
		await setSimulatorUrl("http://localhost:3000/slice-simulator", { repo, token, host });
		const origin = `https://test-${crypto.randomUUID()}.example.com`;

		const { stdout, stderr, exitCode } = await prismic("preview", ["add", `${origin}/api/preview`]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain(
			[
				"NOTE: The Page Builder loads slice previews from the simulator URL, which is still http://localhost:3000/slice-simulator. If this preview is for production, update it with:",
				`  prismic preview set-simulator ${origin}/slice-simulator`,
			].join("\n"),
		);
	});

	it("skips the simulator note when the hosts match", async ({
		expect,
		prismic,
		repo,
		token,
		host,
	}) => {
		const origin = `https://test-${crypto.randomUUID()}.example.com`;
		await setSimulatorUrl(`${origin}/slice-simulator`, { repo, token, host });

		const { stdout, stderr, exitCode } = await prismic("preview", ["add", `${origin}/api/preview`]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).not.toContain("NOTE:");
	});
});
