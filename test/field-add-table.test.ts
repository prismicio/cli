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
	const { stdout, stderr, exitCode } = await prismic("field", ["add", "table", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic field add table <id> [options]");
});

it("adds a table field to a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, stderr, exitCode } = await prismic("field", [
		"add",
		"table",
		"my_table",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Field added: my_table");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_table;
	expect(field).toMatchObject({ type: "Table" });
});

it("adds a table field to a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("field", [
		"add",
		"table",
		"my_table",
		"--to-type",
		customType.id,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Field added: my_table");

	const updated = await readLocalCustomType(project, customType.id);
	const field = updated.json.Main.my_table;
	expect(field).toMatchObject({ type: "Table" });
});
