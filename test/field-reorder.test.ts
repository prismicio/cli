import type { Group } from "@prismicio/types-internal/lib/customtypes";

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
	const { stdout, exitCode } = await prismic("field", ["reorder", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field reorder <id> [options]");
});

it("reorders a field in a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.field_a = { type: "Boolean", config: { label: "A" } };
	slice.variations[0].primary!.field_b = { type: "Boolean", config: { label: "B" } };
	slice.variations[0].primary!.field_c = { type: "Boolean", config: { label: "C" } };
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"reorder",
		"field_a",
		"--after",
		"field_c",
		"--from-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field reordered: field_a");

	const updated = await readLocalSlice(project, slice.id);
	expect(Object.keys(updated!.variations[0].primary!)).toEqual(["field_b", "field_c", "field_a"]);
});

it("reorders a field in a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	customType.json.Main.title = { type: "StructuredText", config: { label: "Title" } };
	customType.json.Main.body = { type: "StructuredText", config: { label: "Body" } };
	customType.json.Main.image = { type: "Image", config: { label: "Image" } };
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("field", [
		"reorder",
		"image",
		"--before",
		"body",
		"--from-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field reordered: image");

	const updated = await readLocalCustomType(project, customType.id);
	expect(Object.keys(updated.json.Main)).toEqual(["title", "image", "body"]);
});

it("moves a field across tabs in a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	customType.json.Main.title = { type: "StructuredText", config: { label: "Title" } };
	customType.json.Main.body = { type: "StructuredText", config: { label: "Body" } };
	customType.json.SEO = {
		meta_title: { type: "Text", config: { label: "Meta Title" } },
		meta_desc: { type: "Text", config: { label: "Meta Description" } },
	};
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("field", [
		"reorder",
		"body",
		"--after",
		"meta_title",
		"--from-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field reordered: body");

	const updated = await readLocalCustomType(project, customType.id);
	expect(Object.keys(updated.json.Main)).toEqual(["title"]);
	expect(Object.keys(updated.json.SEO)).toEqual(["meta_title", "body", "meta_desc"]);
});

it("reorders a nested field in a group", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.my_group = {
		type: "Group",
		config: {
			label: "My Group",
			fields: {
				sub_a: { type: "Boolean", config: { label: "A" } },
				sub_b: { type: "Boolean", config: { label: "B" } },
				sub_c: { type: "Boolean", config: { label: "C" } },
			},
		},
	};
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"reorder",
		"my_group.sub_c",
		"--before",
		"my_group.sub_a",
		"--from-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field reordered: my_group.sub_c");

	const updated = await readLocalSlice(project, slice.id);
	const group = updated!.variations[0].primary!.my_group as Group;
	expect(Object.keys(group.config!.fields!)).toEqual(["sub_c", "sub_a", "sub_b"]);
});

it("errors when the field does not exist", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.field_a = { type: "Boolean", config: { label: "A" } };
	await writeLocalSlice(project, slice);

	const { stderr, exitCode } = await prismic("field", [
		"reorder",
		"missing",
		"--after",
		"field_a",
		"--from-slice",
		slice.id,
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('"missing"');
});
