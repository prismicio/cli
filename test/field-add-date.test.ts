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
	const { stdout, exitCode } = await prismic("field", ["add", "date", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add date <id> [options]");
});

it("adds a date field to a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"date",
		"my_date",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_date");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_date;
	expect(field).toMatchObject({ type: "Date" });
});

it("adds a date field to a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"date",
		"my_date",
		"--to-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_date");

	const updated = await readLocalCustomType(project, customType.id);
	const field = updated.json.Main.my_date;
	expect(field).toMatchObject({ type: "Date" });
});
