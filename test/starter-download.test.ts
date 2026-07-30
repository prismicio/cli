import { zipSync } from "fflate";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it as unitTest, onTestFinished, vi } from "vitest";

import { readURLFile } from "../src/lib/file";
import { findPackageJson } from "../src/lib/packageJson";
import { addPreview, hasPreviewByURL, removePreviewsByURL } from "../src/lib/prismic/clients/core";
import {
	assertStarterRepositoryAccess,
	assertStarterRepositoryHasModels,
	patchStarterConfig,
	resolveStarterArchive,
	starterHostedPreviewURL,
	starterLocalPreviewURL,
} from "../src/lib/starter";
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

it("validates repository access", async ({ expect, login, prismic }) => {
	await login();
	const { stderr, exitCode } = await prismic("starter", [
		"download",
		"--repo",
		"missing-repository",
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Repository "missing-repository" not found in your account');
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

describe.sequential("Starter download", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	unitTest("builds the archive URL from repository starter metadata", () => {
		expect(
			resolveStarterArchive({
				id: "prismicio/next-instant-start",
				revision: "d2d78ca51884d0d665ec58879d370d033eefaf04",
				framework: "next",
			}).toString(),
		).toBe(
			"https://github.com/prismicio/next-instant-start/archive/d2d78ca51884d0d665ec58879d370d033eefaf04.zip",
		);
	});

	unitTest("rejects repositories without starter provenance", () => {
		expect(() => resolveStarterArchive(null)).toThrow(
			"Repository does not support starter download.",
		);
		expect(() => resolveStarterArchive(undefined)).toThrow(
			"Repository does not support starter download.",
		);
	});

	unitTest("rejects unsupported starter metadata", () => {
		expect(() =>
			resolveStarterArchive({
				id: "prismicio/other-starter",
				revision: "d2d78ca51884d0d665ec58879d370d033eefaf04",
				framework: "next",
			}),
		).toThrow('Repository starter "prismicio/other-starter" is not supported');

		expect(() =>
			resolveStarterArchive({
				id: "prismicio/next-instant-start",
				revision: "d2d78ca51884d0d665ec58879d370d033eefaf04",
				framework: "nuxt",
			}),
		).toThrow('Repository starter framework "nuxt" is not supported');

		expect(() =>
			resolveStarterArchive({
				id: "prismicio/next-instant-start",
				revision: "not-a-sha",
				framework: "next",
			}),
		).toThrow('Repository starter revision "not-a-sha" is not a valid Git commit SHA.');
	});

	unitTest("uses the hosted preview URL for cleanup", () => {
		expect(starterHostedPreviewURL).toBe("https://next-instant-start.vercel.app/api/preview");
	});

	unitTest("validates repository access from the authenticated profile", () => {
		const profile = {
			email: "user@example.com",
			shortId: "user",
			intercomHash: "hash",
			repositories: [{ domain: "my-repo" }],
		};

		expect(() => assertStarterRepositoryAccess("my-repo", profile)).not.toThrow();
		expect(() => assertStarterRepositoryAccess("other-repo", profile)).toThrow(
			'Repository "other-repo" not found in your account.',
		);
	});

	unitTest("rejects repositories without starter models", () => {
		expect(() => assertStarterRepositoryHasModels("my-repo", [], [])).toThrow(
			'Repository "my-repo" has no starter models.',
		);
		expect(() => assertStarterRepositoryHasModels("my-repo", [{}], [])).not.toThrow();
		expect(() => assertStarterRepositoryHasModels("my-repo", [], [{}])).not.toThrow();
	});

	unitTest("patches repository settings while preserving starter config", async () => {
		const destination = await makeTemporaryDirectory();
		await writeFile(
			join(destination, "prismic.config.json"),
			JSON.stringify({
				repositoryName: "starter",
				documentAPIEndpoint: "https://starter.cdn.prismic.io/api/v2",
				libraries: ["./src/slices"],
				routes: [{ type: "page", path: "/:uid" }],
			}),
		);

		await patchStarterConfig(destination, "my-repo", "prismic.io");

		await expect(
			readFile(join(destination, "prismic.config.json"), "utf8").then(JSON.parse),
		).resolves.toEqual({
			repositoryName: "my-repo",
			documentAPIEndpoint: "https://my-repo.prismic.io/api/v2",
			libraries: ["./src/slices"],
			routes: [{ type: "page", path: "/:uid" }],
		});
	});

	unitTest("reports archive download failures", async () => {
		const starterArchiveURL = resolveStarterArchive({
			id: "prismicio/next-instant-start",
			revision: "d2d78ca51884d0d665ec58879d370d033eefaf04",
			framework: "next",
		});

		vi.stubGlobal(
			"fetch",
			vi.fn<typeof fetch>(async () => new Response("Not found", { status: 404 })),
		);

		await expect(readURLFile(starterArchiveURL)).rejects.toThrow(
			`Failed to download file from "${starterArchiveURL.toString()}" (HTTP 404).`,
		);
	});

	unitTest("finds an existing local development preview", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
			jsonResponse({
				results: [
					{
						id: "development-preview",
						label: "Development",
						url: starterLocalPreviewURL,
					},
				],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			hasPreviewByURL(starterLocalPreviewURL, {
				repo: "my-repo",
				token: "test-token",
				host: "prismic.io",
			}),
		).resolves.toBe(true);
	});

	unitTest("removes only the hosted starter preview", async () => {
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

	unitTest("adds the local development preview", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		await addPreview(
			{
				name: "Development",
				websiteURL: "http://localhost:3000",
				resolverPath: "/api/preview",
			},
			{
				repo: "my-repo",
				token: "test-token",
				host: "prismic.io",
			},
		);

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0];
		expect(url.toString()).toContain("/previews/new");
		expect(init?.method).toBe("POST");
		expect(init?.body).toBe(
			JSON.stringify({
				name: "Development",
				websiteURL: "http://localhost:3000",
				resolverPath: "/api/preview",
			}),
		);
	});
});

describe("Package installation", () => {
	unitTest("does not find package.json above the extracted project", async () => {
		const root = await makeTemporaryDirectory();
		const destination = join(root, "my-repo");
		await mkdir(destination);
		await writeFile(join(root, "package.json"), "{}");
		const destinationUrl = pathToFileURL(`${destination}/`);

		await expect(findPackageJson({ start: destinationUrl, stop: destinationUrl })).rejects.toThrow(
			"Could not find a package.json file",
		);
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

	unitTest("strips a single GitHub archive root when requested", async () => {
		const root = await makeTemporaryDirectory();
		const destination = join(root, "my-repo");

		await extractZip(
			zipSync({
				"starter-commit/package.json": new TextEncoder().encode('{"name":"starter"}'),
				"starter-commit/src/app/page.tsx": new TextEncoder().encode("export default Page"),
			}),
			destination,
			{ stripSingleRootDirectory: true },
		);

		await expect(readFile(join(destination, "package.json"), "utf8")).resolves.toBe(
			'{"name":"starter"}',
		);
		await expect(access(join(destination, "starter-commit"))).rejects.toThrow();
	});

	unitTest("accepts an explicit GitHub archive root directory", async () => {
		const root = await makeTemporaryDirectory();
		const destination = join(root, "my-repo");

		await extractZip(
			zipSync({
				"starter-commit/": new Uint8Array(),
				"starter-commit/package.json": new TextEncoder().encode('{"name":"starter"}'),
			}),
			destination,
			{ stripSingleRootDirectory: true },
		);

		await expect(readFile(join(destination, "package.json"), "utf8")).resolves.toBe(
			'{"name":"starter"}',
		);
	});

	unitTest("rejects a top-level file masquerading as the archive root", async () => {
		const root = await makeTemporaryDirectory();
		const destination = join(root, "my-repo");

		await expect(
			extractZip(
				zipSync({
					"starter-commit": new TextEncoder().encode("not a directory"),
					"starter-commit/package.json": new TextEncoder().encode("{}"),
				}),
				destination,
				{ stripSingleRootDirectory: true },
			),
		).rejects.toThrow("ZIP archive does not contain a single root directory");
		await expect(access(destination)).rejects.toThrow();
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
