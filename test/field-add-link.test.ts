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
	const { stdout, stderr, exitCode } = await prismic("field", ["add", "link", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic field add link <id> [options]");
	expect(stdout).toContain("prismic docs view fields/link");
	expect(stdout).toContain("--no-allow-text");
	expect(stdout).toContain("--no-allow-target-blank");
});

it("adds a link field to a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, stderr, exitCode } = await prismic("field", [
		"add",
		"link",
		"my_link",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Field added: my_link");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_link;
	expect(field).toMatchObject({
		type: "Link",
		config: { allowText: true, allowTargetBlank: true },
	});
});

it("adds a link field without text or new tab", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stderr, exitCode } = await prismic("field", [
		"add",
		"link",
		"my_link",
		"--to-slice",
		slice.id,
		"--no-allow-text",
		"--no-allow-target-blank",
	]);
	expect(exitCode, stderr).toBe(0);

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_link;
	expect(field.config).not.toHaveProperty("allowText");
	expect(field.config).not.toHaveProperty("allowTargetBlank");
});

it("adds a link field to a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("field", [
		"add",
		"link",
		"my_link",
		"--to-type",
		customType.id,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Field added: my_link");

	const updated = await readLocalCustomType(project, customType.id);
	const field = updated.json.Main.my_link;
	expect(field).toMatchObject({ type: "Link" });
});

it("adds a link field restricted to custom types", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { exitCode } = await prismic("field", [
		"add",
		"link",
		"cta",
		"--to-type",
		customType.id,
		"--custom-type",
		"page",
	]);
	expect(exitCode).toBe(0);

	const updated = await readLocalCustomType(project, customType.id);
	const field = updated.json.Main.cta;
	expect(field).toMatchObject({ type: "Link", config: { customtypes: ["page"] } });
	expect(field.config).not.toHaveProperty("select");
});

it("adds a media link field with --allow media", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, stderr, exitCode } = await prismic("field", [
		"add",
		"link",
		"my_media",
		"--to-slice",
		slice.id,
		"--allow",
		"media",
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Field added: my_media");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_media;
	expect(field).toMatchObject({ type: "Link", config: { select: "media", allowText: true } });
	expect(field.config).not.toHaveProperty("allowTargetBlank");
});

it("adds a document link field without new tab", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stderr, exitCode } = await prismic("field", [
		"add",
		"link",
		"my_doc",
		"--to-slice",
		slice.id,
		"--allow",
		"document",
	]);
	expect(exitCode, stderr).toBe(0);

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_doc;
	expect(field).toMatchObject({ type: "Link", config: { select: "document", allowText: true } });
	expect(field.config).not.toHaveProperty("allowTargetBlank");
});

it("rejects a flag with its --no- form", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stderr, exitCode } = await prismic("field", [
		"add",
		"link",
		"my_link",
		"--to-slice",
		slice.id,
		"--allow-text",
		"--no-allow-text",
	]);
	expect(exitCode).not.toBe(0);
	expect(stderr).toContain("Only one of --allow-text or --no-allow-text");
});

it("still accepts --allow-text and --allow-target-blank", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stderr, exitCode } = await prismic("field", [
		"add",
		"link",
		"my_doc",
		"--to-slice",
		slice.id,
		"--allow",
		"document",
		"--allow-text",
		"--allow-target-blank",
	]);
	expect(exitCode, stderr).toBe(0);

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_doc;
	expect(field.config).toMatchObject({ allowText: true, allowTargetBlank: true });
});
