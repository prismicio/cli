import { buildSlice, it, readLocalSlice, writeLocalSlice } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("slice", ["remove", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic slice remove <id> [options]");
});

it("removes a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, stderr, exitCode } = await prismic("slice", ["remove", slice.id]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Slice removed: ${slice.id}`);

	const removed = await readLocalSlice(project, slice.id);
	expect(removed).toBeUndefined();
});
