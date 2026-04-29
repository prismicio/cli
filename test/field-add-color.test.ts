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
	const { stdout, exitCode } = await prismic("field", ["add", "color", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add color <id> [options]");
});

it("adds a color field to a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"color",
		"my_color",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_color");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_color;
	expect(field).toMatchObject({ type: "Color" });
});

it("adds a color field to a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"color",
		"my_color",
		"--to-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_color");

	const updated = await readLocalCustomType(project, customType.id);
	const field = updated.json.Main.my_color;
	expect(field).toMatchObject({ type: "Color" });
});
