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
	const { stdout, exitCode } = await prismic("field", ["add", "link", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add link <id> [options]");
});

it("adds a link field to a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"link",
		"my_link",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_link");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_link;
	expect(field).toMatchObject({ type: "Link" });
});

it("adds a link field to a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"link",
		"my_link",
		"--to-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_link");

	const updated = await readLocalCustomType(project, customType.id);
	const field = updated.json.Main.my_link;
	expect(field).toMatchObject({ type: "Link" });
});

it("adds a media link field with --allow media", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"link",
		"my_media",
		"--to-slice",
		slice.id,
		"--allow",
		"media",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_media");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_media;
	expect(field).toMatchObject({ type: "Link", config: { select: "media" } });
});
