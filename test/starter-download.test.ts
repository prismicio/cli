import { zipSync } from "fflate";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it as unitTest, onTestFinished, vi } from "vitest";

import { removePreviewsByURL } from "../src/lib/prismic/clients/core";
import { getOrCreateInstantStartExport } from "../src/lib/prismic/clients/website-generator";
import { extractZip } from "../src/lib/zip";
import { captureOutput, it } from "./it";

it("supports starter --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("starter", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic starter <command>");
	expect(stdout).toContain("download");
});

it("supports starter download --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("starter", ["download", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic starter download [options]");
	expect(stdout).toContain("--repo string");
	expect(stdout).toContain("(required)");
});

it("requires --repo", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("starter", ["download"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Missing required option: --repo");
});

it("rejects an unknown starter subcommand", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("starter", ["unknown"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Unknown command: unknown");
});

it("rejects extra download arguments", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("starter", ["download", "extra", "--repo", "my-repo"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("extra");
});

it("rejects init-only options", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("starter", [
		"download",
		"--repo",
		"my-repo",
		"--lang",
		"en-us",
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("--lang");
});

it("validates the repository name", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("starter", [
		"download",
		"--repo",
		"invalid_repository",
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Invalid repository name");
});

it("uses the browser login flow", async ({ expect, logout, prismic, repo }) => {
	await logout();
	const proc = prismic("starter", ["download", "--repo", repo, "--no-browser"]);
	const output = captureOutput(proc);

	await expect.poll(output, { timeout: 15_000 }).toMatch(/port=(\d+)/);
	proc.kill();
});

it("lists starter as a top-level command", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("starter");
	expect(stdout).not.toContain("instant-start");
});

describe.sequential("Starter download API client", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	unitTest("reuses an export that is already ready", async () => {
		const readyExport = {
			status: "ready",
			framework: "next",
			preparedAt: "2026-07-17T10:00:00.000Z",
			downloadUrl: "https://cdn.example.com/my-repo/.exports/instant-start.zip",
			previewUrls: ["https://starter.example.com/api/preview"],
		};
		const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(readyExport));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			getOrCreateInstantStartExport("my-repo", {
				token: "test-token",
				host: "prismic.io",
			}),
		).resolves.toEqual(readyExport);
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	unitTest("creates an export when none is prepared", async () => {
		const readyExport = {
			status: "ready",
			framework: "next",
			preparedAt: "2026-07-17T10:00:00.000Z",
			downloadUrl: "https://cdn.example.com/my-repo/.exports/instant-start.zip",
			previewUrls: ["https://starter.example.com/api/preview"],
		};
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ status: "not-prepared" }))
			.mockResolvedValueOnce(jsonResponse(readyExport));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			getOrCreateInstantStartExport("my-repo", {
				token: "test-token",
				host: "prismic.io",
			}),
		).resolves.toEqual(readyExport);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		const [, init] = fetchMock.mock.calls[1];
		expect(init?.method).toBe("POST");
		expect(init?.body).toBe(JSON.stringify({ framework: "next", replace: false }));
	});

	unitTest("removes only previews declared by the export", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				jsonResponse({
					results: [
						{
							id: "starter-preview",
							label: "Production",
							url: "https://starter.example.com/api/preview",
						},
						{
							id: "custom-preview",
							label: "Custom",
							url: "https://custom.example.com/api/preview",
						},
					],
				}),
			)
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		await removePreviewsByURL(["https://starter.example.com/api/preview"], {
			repo: "my-repo",
			token: "test-token",
			host: "prismic.io",
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		const [url, init] = fetchMock.mock.calls[1];
		expect(url.toString()).toContain("/previews/delete/starter-preview");
		expect(init?.method).toBe("POST");
	});
});

describe("ZIP extraction", () => {
	unitTest("extracts nested files into an empty destination", async () => {
		const root = await makeTemporaryDirectory();
		const destination = join(root, "my-repo");
		await mkdir(destination);

		await extractZip(
			zipSync({
				"package.json": new TextEncoder().encode('{"name":"starter"}'),
				"src/app/page.tsx": new TextEncoder().encode("export default Page"),
			}),
			destination,
		);

		await expect(readFile(join(destination, "package.json"), "utf8")).resolves.toBe(
			'{"name":"starter"}',
		);
		await expect(readFile(join(destination, "src/app/page.tsx"), "utf8")).resolves.toBe(
			"export default Page",
		);
	});

	unitTest("does not overwrite a non-empty destination", async () => {
		const root = await makeTemporaryDirectory();
		const destination = join(root, "my-repo");
		await mkdir(destination);
		await writeFile(join(destination, "keep.txt"), "keep");

		await expect(
			extractZip(zipSync({ "package.json": new TextEncoder().encode("{}") }), destination),
		).rejects.toThrow("Destination directory is not empty");
		await expect(readFile(join(destination, "keep.txt"), "utf8")).resolves.toBe("keep");
	});

	unitTest("rejects path traversal without leaving partial output", async () => {
		const root = await makeTemporaryDirectory();
		const destination = join(root, "my-repo");

		await expect(
			extractZip(
				zipSync({
					"package.json": new TextEncoder().encode("{}"),
					"../outside.txt": new TextEncoder().encode("outside"),
				}),
				destination,
			),
		).rejects.toThrow("ZIP entry escapes the destination");
		await expect(access(destination)).rejects.toThrow();
		await expect(access(join(root, "outside.txt"))).rejects.toThrow();
	});
});

function jsonResponse(value: unknown): Response {
	return new Response(JSON.stringify(value), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

async function makeTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "prismic-starter-download-"));
	onTestFinished(() => rm(directory, { recursive: true, force: true }));
	return directory;
}
