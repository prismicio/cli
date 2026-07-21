import { zipSync } from "fflate";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it as unitTest, onTestFinished, vi } from "vitest";

import { getOrCreateInstantStartExport } from "../src/lib/prismic/clients/website-generator";
import { extractZip } from "../src/lib/zip";
import { it } from "./it";

it("supports instant-start --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("instant-start", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic instant-start [options]");
	expect(stdout).toContain("--export string");
});

it("requires --export", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("instant-start");
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Missing required option: --export");
});

describe.sequential("Instant Start API client", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	unitTest("reuses an export that is already ready", async () => {
		const readyExport = {
			status: "ready",
			framework: "next",
			preparedAt: "2026-07-17T10:00:00.000Z",
			downloadUrl: "https://cdn.example.com/my-repo/.exports/instant-start.zip",
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
	const directory = await mkdtemp(join(tmpdir(), "prismic-instant-start-"));
	onTestFinished(() => rm(directory, { recursive: true, force: true }));
	return directory;
}
