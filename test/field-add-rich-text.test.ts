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
	const { stdout, exitCode } = await prismic("field", ["add", "rich-text", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add rich-text <id> [options]");
});

it("adds a rich text field to a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"rich-text",
		"my_content",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_content");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_content;
	expect(field).toMatchObject({ type: "StructuredText" });
});

it("adds a rich text field to a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"rich-text",
		"my_content",
		"--to-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_content");

	const updated = await readLocalCustomType(project, customType.id);
	const field = updated.json.Main.my_content;
	expect(field).toMatchObject({ type: "StructuredText" });
});
