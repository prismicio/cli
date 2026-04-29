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
	const { stdout, exitCode } = await prismic("field", ["add", "boolean", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add boolean <id> [options]");
});

it("adds a boolean field to a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"boolean",
		"my_field",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_field");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_field;
	expect(field).toMatchObject({ type: "Boolean" });
});

it("adds a boolean field to a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"boolean",
		"is_active",
		"--to-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: is_active");

	const updated = await readLocalCustomType(project, customType.id);
	const field = updated.json.Main.is_active;
	expect(field).toMatchObject({ type: "Boolean" });
});
