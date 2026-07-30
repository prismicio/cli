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
});
