import { buildCustomType, buildSlice, it } from "./it";
import { getCustomTypes, getSlices, insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["edit", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field edit <id> [options]");
});

it("edits a field label on a slice", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.my_field = { type: "Boolean", config: { label: "Old Label" } };
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"edit",
		"my_field",
		"--from-slice",
		slice.id,
		"--label",
		"New Label",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field updated: my_field");

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const field = updated!.variations[0].primary!.my_field;
	expect(field).toMatchObject({ type: "Boolean", config: { label: "New Label" } });
});

it("edits a field label on a custom type", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({
		json: {
			Main: {
				title: {
					type: "StructuredText",
					config: { label: "Title", single: "heading1" },
				},
			},
		},
	});
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"edit",
		"title",
		"--from-type",
		customType.id,
		"--label",
		"Page Title",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field updated: title");

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	expect(updated!.json.Main.title).toMatchObject({
		type: "StructuredText",
		config: { label: "Page Title" },
	});
});

it("edits boolean field options", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.is_active = { type: "Boolean", config: { label: "Active" } };
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"edit",
		"is_active",
		"--from-slice",
		slice.id,
		"--default-value",
		"true",
		"--true-label",
		"Yes",
		"--false-label",
		"No",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field updated: is_active");

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const field = updated!.variations[0].primary!.is_active;
	expect(field).toMatchObject({
		type: "Boolean",
		config: {
			default_value: true,
			placeholder_true: "Yes",
			placeholder_false: "No",
		},
	});
});

it("edits number field options", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.quantity = { type: "Number", config: { label: "Quantity" } };
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"edit",
		"quantity",
		"--from-slice",
		slice.id,
		"--min",
		"0",
		"--max",
		"100",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field updated: quantity");

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const field = updated!.variations[0].primary!.quantity;
	expect(field).toMatchObject({
		type: "Number",
		config: { min: 0, max: 100 },
	});
});

it("edits select field options", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.color = {
		type: "Select",
		config: { label: "Color", options: ["red", "blue"] },
	};
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"edit",
		"color",
		"--from-slice",
		slice.id,
		"--default-value",
		"green",
		"--option",
		"red",
		"--option",
		"green",
		"--option",
		"blue",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field updated: color");

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const field = updated!.variations[0].primary!.color;
	expect(field).toMatchObject({
		type: "Select",
		config: {
			default_value: "green",
			options: ["red", "green", "blue"],
		},
	});
});

it("edits link field options", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.cta_link = {
		type: "Link",
		config: { label: "CTA Link", allowTargetBlank: false },
	};
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"edit",
		"cta_link",
		"--from-slice",
		slice.id,
		"--allow-target-blank",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field updated: cta_link");

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const field = updated!.variations[0].primary!.cta_link;
	expect(field).toMatchObject({
		type: "Link",
		config: { allowTargetBlank: true },
	});
});
