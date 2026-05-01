import { buildSlice, it, readLocalSlice, writeLocalSlice } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["remove-variation", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice remove-variation <id> [options]");
});

it("removes a variation from a slice", async ({ expect, prismic, project }) => {
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

	await writeLocalSlice(project, sliceWithVariation);

	const { stdout, exitCode } = await prismic("slice", [
		"remove-variation",
		variationId,
		"--from",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Removed variation "${variationId}" from slice "${slice.id}"`);

	const updated = await readLocalSlice(project, slice.id);
	const removed = updated?.variations.find((v) => v.id === variationId);
	expect(removed).toBeUndefined();
});
