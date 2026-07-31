import { afterEach, describe, expect, it, vi } from "vitest";

import {
	assertStarterRepositoryHasModels,
	completeStarterHandoff,
	hasUnsafeStarterModelChanges,
	resolveStarterHostedPreviewURL,
} from "../src/lib/starter";

describe("starter handoff", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("builds the hosted preview URL from starter metadata", () => {
		expect(
			resolveStarterHostedPreviewURL({
				id: "prismicio/custom-starter",
				revision: "starter-release",
				framework: "custom",
				deploymentUrl: "https://starter.example.com/",
			}),
		).toBe("https://starter.example.com/api/preview");
	});

	it("rejects repositories without starter models", () => {
		expect(() => assertStarterRepositoryHasModels("my-repo", [], [])).toThrow(
			'Repository "my-repo" has no starter models.',
		);
		expect(() => assertStarterRepositoryHasModels("my-repo", [{}], [])).not.toThrow();
		expect(() => assertStarterRepositoryHasModels("my-repo", [], [{}])).not.toThrow();
	});

	it("only treats updates and deletions as unsafe automatic syncs", () => {
		expect(
			hasUnsafeStarterModelChanges(
				{ insert: [], update: [], delete: [] },
				{ insert: [{}], update: [], delete: [] },
			),
		).toBe(false);
		expect(
			hasUnsafeStarterModelChanges({
				insert: [],
				update: [{}],
				delete: [],
			}),
		).toBe(true);
		expect(
			hasUnsafeStarterModelChanges({
				insert: [],
				update: [],
				delete: [{}],
			}),
		).toBe(true);
	});

	it("completes previews, simulator, and onboarding", async () => {
		let previewReadCount = 0;
		const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
			const url = input.toString();
			if (url.includes("/core/repository/preview_configs")) {
				previewReadCount += 1;
				return jsonResponse({
					results:
						previewReadCount === 1
							? [
									{
										id: "hosted-preview",
										label: "Production",
										url: "https://starter.example.com/api/preview",
									},
								]
							: [],
				});
			}
			if (url.includes("/onboarding")) {
				return jsonResponse({
					completedSteps: init?.method === "PATCH" ? ["instantStart_continueBuildingLocally"] : [],
				});
			}
			return new Response(null, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			completeStarterHandoff(
				{
					id: "prismicio/custom-starter",
					revision: "starter-release",
					framework: "custom",
					deploymentUrl: "https://starter.example.com/",
				},
				{
					repo: "my-repo",
					token: "test-token",
					host: "prismic.io",
				},
			),
		).resolves.toEqual({ localPreviewConfigured: true });

		expect(fetchMock).toHaveBeenCalledTimes(7);
		expect(fetchMock.mock.calls[3][0].toString()).toContain("/previews/new");
		expect(fetchMock.mock.calls[4][0].toString()).toContain("/core/repository");
		expect(fetchMock.mock.calls[6][0].toString()).toContain(
			"/onboarding/instantStart_continueBuildingLocally/toggle",
		);
	});
});

function jsonResponse(value: unknown): Response {
	return new Response(JSON.stringify(value), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}
