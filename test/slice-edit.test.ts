import { buildSlice, it } from "./it";
import { getSlices, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["edit", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice edit <id> [options]");
});

it("edits a slice name", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const newName = `SliceS${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("slice", ["edit", slice.id, "--name", newName]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Slice updated: "${newName}"`);

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	expect(updated?.name).toBe(newName);
});
