import type { Group } from "@prismicio/types-internal/lib/customtypes";

import { buildCustomType, buildSlice, it } from "./it";
import { getCustomTypes, getSlices, insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["reorder", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field reorder <id> [options]");
});

it("reorders a field in a slice", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.field_a = { type: "Boolean", config: { label: "A" } };
	slice.variations[0].primary!.field_b = { type: "Boolean", config: { label: "B" } };
	slice.variations[0].primary!.field_c = { type: "Boolean", config: { label: "C" } };
	await insertSlice(slice, { repo, token, host });

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

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	expect(Object.keys(updated!.variations[0].primary!)).toEqual(["field_b", "field_c", "field_a"]);
});

it("reorders a field in a custom type", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType();
	customType.json.Main.title = { type: "StructuredText", config: { label: "Title" } };
	customType.json.Main.body = { type: "StructuredText", config: { label: "Body" } };
	customType.json.Main.image = { type: "Image", config: { label: "Image" } };
	await insertCustomType(customType, { repo, token, host });

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

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	expect(Object.keys(updated!.json.Main)).toEqual(["title", "image", "body"]);
});

it("moves a field across tabs in a custom type", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType();
	customType.json.Main.title = { type: "StructuredText", config: { label: "Title" } };
	customType.json.Main.body = { type: "StructuredText", config: { label: "Body" } };
	customType.json.SEO = {
		meta_title: { type: "Text", config: { label: "Meta Title" } },
		meta_desc: { type: "Text", config: { label: "Meta Description" } },
	};
	await insertCustomType(customType, { repo, token, host });

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

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	expect(Object.keys(updated!.json.Main)).toEqual(["title"]);
	expect(Object.keys(updated!.json.SEO)).toEqual(["meta_title", "body", "meta_desc"]);
});

it("reorders a nested field in a group", async ({ expect, prismic, repo, token, host }) => {
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
	await insertSlice(slice, { repo, token, host });

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

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const group = updated!.variations[0].primary!.my_group as Group;
	expect(Object.keys(group.config!.fields!)).toEqual(["sub_c", "sub_a", "sub_b"]);
});

it("errors when the field does not exist", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.field_a = { type: "Boolean", config: { label: "A" } };
	await insertSlice(slice, { repo, token, host });

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
