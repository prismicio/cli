import { buildSlice, it } from "./it";
import { getSlices, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["remove-variation", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice remove-variation <name> [options]");
});

it("removes a variation from a slice", async ({ expect, prismic, repo, token, host }) => {
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

	const { stdout, exitCode } = await prismic("slice", [
		"remove-variation",
		variationName,
		"--from",
		slice.name,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Removed variation "${variationName}" from slice "${slice.name}"`);

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const removed = updated?.variations.find((v) => v.id === variationId);
	expect(removed).toBeUndefined();
});
