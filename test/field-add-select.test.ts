import {
	buildCustomType,
	buildSlice,
	it,
	readLocalCustomType,
	readLocalSlice,
	writeLocalCustomType,
	writeLocalSlice,
} from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["add", "select", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add select <id> [options]");
});

it("adds a select field to a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"select",
		"my_select",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_select");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_select;
	expect(field).toMatchObject({ type: "Select" });
});

it("adds a select field to a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"select",
		"my_select",
		"--to-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_select");

	const updated = await readLocalCustomType(project, customType.id);
	const field = updated.json.Main.my_select;
	expect(field).toMatchObject({ type: "Select" });
});
