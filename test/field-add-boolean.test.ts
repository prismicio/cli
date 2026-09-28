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
	const { stdout, stderr, exitCode } = await prismic("field", ["add", "boolean", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic field add boolean <id> [options]");
	expect(stdout).toContain("prismic docs view fields/boolean");
});

it("adds a boolean field to a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, stderr, exitCode } = await prismic("field", [
		"add",
		"boolean",
		"my_field",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Field added: my_field");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_field;
	expect(field).toMatchObject({ type: "Boolean" });
});

it("sets the default value to true", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stderr, exitCode } = await prismic("field", [
		"add",
		"boolean",
		"my_field",
		"--to-slice",
		slice.id,
		"--default-true",
	]);
	expect(exitCode, stderr).toBe(0);

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_field;
	expect(field).toMatchObject({ type: "Boolean", config: { default_value: true } });
});

it("sets the default value to false", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stderr, exitCode } = await prismic("field", [
		"add",
		"boolean",
		"my_field",
		"--to-slice",
		slice.id,
		"--default-false",
	]);
	expect(exitCode, stderr).toBe(0);

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_field;
	expect(field).toMatchObject({ type: "Boolean", config: { default_value: false } });
});

it("errors when both --default-true and --default-false are given", async ({
	expect,
	prismic,
	project,
}) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stderr, exitCode } = await prismic("field", [
		"add",
		"boolean",
		"my_field",
		"--to-slice",
		slice.id,
		"--default-true",
		"--default-false",
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Only one of --default-true or --default-false can be specified.");
});

it("adds a boolean field to a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("field", [
		"add",
		"boolean",
		"is_active",
		"--to-type",
		customType.id,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Field added: is_active");

	const updated = await readLocalCustomType(project, customType.id);
	const field = updated.json.Main.is_active;
	expect(field).toMatchObject({ type: "Boolean" });
});
