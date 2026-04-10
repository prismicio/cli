import { buildSlice, it } from "./it";
import { getSlices, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["add-variation", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice add-variation <name> [options]");
});

it("adds a variation to a slice", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const variationName = `Variation${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("slice", [
		"add-variation",
		variationName,
		"--to",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Added variation "${variationName}"`);
	expect(stdout).toContain(`to slice "${slice.id}"`);

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const variation = updated?.variations.find((v) => v.name === variationName);
	expect(variation).toBeDefined();
});
