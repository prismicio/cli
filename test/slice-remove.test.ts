import { buildSlice, it } from "./it";
import { getSlices, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["remove", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice remove <id> [options]");
});

it("removes a slice", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("slice", ["remove", slice.id]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Slice removed: ${slice.id}`);

	const slices = await getSlices({ repo, token, host });
	const removed = slices.find((s) => s.id === slice.id);
	expect(removed).toBeUndefined();
});
