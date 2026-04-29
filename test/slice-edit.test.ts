import { buildSlice, it, readLocalSlice, writeLocalSlice } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["edit", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice edit <id> [options]");
});

it("edits a slice name", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const newName = `SliceS${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("slice", ["edit", slice.id, "--name", newName]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Slice updated: "${newName}"`);

	const updated = await readLocalSlice(project, slice.id);
	expect(updated?.name).toBe(newName);
});
