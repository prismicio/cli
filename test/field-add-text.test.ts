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
	const { stdout, exitCode } = await prismic("field", ["add", "text", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add text <id> [options]");
});

it("adds a text field to a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"text",
		"subtitle",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: subtitle");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.subtitle;
	expect(field).toMatchObject({ type: "Text" });
});

it("adds a text field to a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"text",
		"subtitle",
		"--to-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: subtitle");

	const updated = await readLocalCustomType(project, customType.id);
	const field = updated.json.Main.subtitle;
	expect(field).toMatchObject({ type: "Text" });
});

it("adds a text field to a page type", async ({ expect, prismic, project }) => {
	const pageType = buildCustomType({ format: "page" });
	await writeLocalCustomType(project, pageType);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"text",
		"subtitle",
		"--to-type",
		pageType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: subtitle");

	const updated = await readLocalCustomType(project, pageType.id);
	const field = updated.json.Main.subtitle;
	expect(field).toMatchObject({ type: "Text" });
});
