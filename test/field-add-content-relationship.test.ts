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
	const { stdout, exitCode } = await prismic("field", ["add", "content-relationship", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add content-relationship <id> [options]");
});

it("adds a content relationship field to a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"content-relationship",
		"my_link",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_link");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_link;
	expect(field).toMatchObject({ type: "Link", config: { select: "document" } });
});

it("adds a content relationship field to a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"content-relationship",
		"my_link",
		"--to-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_link");

	const updated = await readLocalCustomType(project, customType.id);
	const field = updated.json.Main.my_link;
	expect(field).toMatchObject({ type: "Link", config: { select: "document" } });
});

it("adds a content relationship field with --field", async ({ expect, prismic, project }) => {
	const target = buildCustomType();
	target.json.Main.title = { type: "Text", config: { label: "Title" } };
	await writeLocalCustomType(project, target);

	const owner = buildCustomType();
	await writeLocalCustomType(project, owner);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"content-relationship",
		"my_link",
		"--to-type",
		owner.id,
		"--custom-type",
		target.id,
		"--field",
		"title",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_link");

	const updated = await readLocalCustomType(project, owner.id);
	const field = updated.json.Main.my_link;
	expect(field).toMatchObject({
		type: "Link",
		config: {
			select: "document",
			customtypes: [{ id: target.id, fields: ["title"] }],
		},
	});
});
