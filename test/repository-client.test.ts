import { afterEach, describe, expect, it, vi } from "vitest";

import { getRepository } from "../src/lib/prismic/clients/repository";

describe("getRepository starter parsing", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});
	it("defaults missing starter metadata to null", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ quotas: { sliceMachineEnabled: true } }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			getRepository({
				repo: "my-repo",
				token: "test-token",
				host: "prismic.io",
			}),
		).resolves.toEqual({
			starter: null,
			quotas: { sliceMachineEnabled: true },
		});
	});

	it("preserves explicit null starter metadata", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ starter: null }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			getRepository({
				repo: "my-repo",
				token: "test-token",
				host: "prismic.io",
			}),
		).resolves.toEqual({
			starter: null,
		});
	});

	it("preserves complete starter provenance", async () => {
		const starter = {
			id: "prismicio/next-instant-start",
			revision: "d2d78ca51884d0d665ec58879d370d033eefaf04",
			framework: "next",
			deploymentUrl: "https://next-instant-start-2a3svap7o-prismic.vercel.app/",
		};
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ starter }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			getRepository({
				repo: "my-repo",
				token: "test-token",
				host: "prismic.io",
			}),
		).resolves.toEqual({ starter });
	});
});
