import { buildSlice, it } from "./it";
import { getSlices, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["edit-variation", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice edit-variation <name> [options]");
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
		variationName,
		"--from-slice",
		slice.name,
		"--name",
		newName,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Variation updated: "${newName}" in slice "${slice.name}"`);

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const variation = updated?.variations.find((v) => v.id === variationId);
	expect(variation?.name).toBe(newName);
});
