import { describe, expect, it } from "vitest";

import {
	buildHostedPreviewUrl,
	isHostedPreviewUrl,
} from "../src/lib/prismic/starterHandoff.ts";

describe("isHostedPreviewUrl", () => {
	const deploymentUrl = "https://next-instant-start-abc123-prismic.vercel.app";
	const repositoryName = "abc12345";

	it("matches hosted preview URLs regardless of query params", () => {
		expect(
			isHostedPreviewUrl({
				previewUrl: `${deploymentUrl}/api/preview/${repositoryName}?prismicHost=dev-tools-wroom.com`,
				deploymentUrl,
				repositoryName,
			}),
		).toBe(true);
	});

	it("matches the canonical hosted preview URL without query params", () => {
		expect(
			isHostedPreviewUrl({
				previewUrl: buildHostedPreviewUrl({
					deploymentUrl,
					repositoryName,
				}),
				deploymentUrl,
				repositoryName,
			}),
		).toBe(true);
	});

	it("does not match a different repository or deployment", () => {
		expect(
			isHostedPreviewUrl({
				previewUrl: `${deploymentUrl}/api/preview/zzzzzzzz?prismicHost=dev-tools-wroom.com`,
				deploymentUrl,
				repositoryName,
			}),
		).toBe(false);

		expect(
			isHostedPreviewUrl({
				previewUrl: `https://other.vercel.app/api/preview/${repositoryName}`,
				deploymentUrl,
				repositoryName,
			}),
		).toBe(false);
	});
});
