import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { buildSlice, it } from "./it";
import { getSlices, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["edit-variation", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice edit-variation <id> [options]");
});

it("edits a variation name", async ({ expect, prismic, repo, token, host }) => {
	const variationName = `Variation${crypto.randomUUID().split("-")[0]}`;
	const variationId = `variation${crypto.randomUUID().split("-")[0]}`;
	const slice = buildSlice();
	const sliceWithVariation = {
		...slice,
		variations: [
			...slice.variations,
			{
				id: variationId,
				name: variationName,
				description: variationName,
				docURL: "",
				imageUrl: "",
				version: "",
			},
		],
	};

	await insertSlice(sliceWithVariation, { repo, token, host });

	const newName = `Variation${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("slice", [
		"edit-variation",
		variationId,
		"--from-slice",
		slice.id,
		"--name",
		newName,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Variation updated: "${variationId}" in slice "${slice.id}"`);

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const variation = updated?.variations.find((v) => v.id === variationId);
	expect(variation?.name).toBe(newName);
});

it("sets a screenshot on a variation", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("slice", [
		"edit-variation",
		"default",
		"--from-slice",
		slice.id,
		"--screenshot",
		"https://images.prismic.io/slice-machine/621a5ec4-0387-4bc5-9860-2dd46cbc07cd_default_ss.png",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Variation updated: "default" in slice "${slice.id}"`);

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const variation = updated?.variations.find((v) => v.id === "default");
	expect(variation?.imageUrl).toContain("https://");
	expect(variation?.imageUrl).toContain(".png");
});

it("sets a local screenshot file on a variation", async ({
	expect,
	prismic,
	project,
	repo,
	token,
	host,
}) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const screenshotUrl =
		"https://images.prismic.io/slice-machine/621a5ec4-0387-4bc5-9860-2dd46cbc07cd_default_ss.png";
	const response = await fetch(screenshotUrl);
	const data = new Uint8Array(await response.arrayBuffer());
	const screenshotFileUrl = new URL("screenshot.png", project);
	await writeFile(screenshotFileUrl, data);
	const screenshotPath = fileURLToPath(screenshotFileUrl);

	const { stdout, exitCode } = await prismic("slice", [
		"edit-variation",
		"default",
		"--from-slice",
		slice.id,
		"--screenshot",
		screenshotPath,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Variation updated: "default" in slice "${slice.id}"`);

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const variation = updated?.variations.find((v) => v.id === "default");
	expect(variation?.imageUrl).toContain("https://");
	expect(variation?.imageUrl).toContain(".png");
});
