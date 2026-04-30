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
	const { stdout, exitCode } = await prismic("field", ["edit", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field edit <id> [options]");
});

it("edits a field label on a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.my_field = { type: "Boolean", config: { label: "Old Label" } };
	await writeLocalSlice(project, slice);

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

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_field;
	expect(field).toMatchObject({ type: "Boolean", config: { label: "New Label" } });
});

it("edits a field label on a custom type", async ({ expect, prismic, project }) => {
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
	await writeLocalCustomType(project, customType);

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

	const updated = await readLocalCustomType(project, customType.id);
	expect(updated.json.Main.title).toMatchObject({
		type: "StructuredText",
		config: { label: "Page Title" },
	});
});

it("edits boolean field options", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.is_active = { type: "Boolean", config: { label: "Active" } };
	await writeLocalSlice(project, slice);

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

	const updated = await readLocalSlice(project, slice.id);
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

it("edits number field options", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.quantity = { type: "Number", config: { label: "Quantity" } };
	await writeLocalSlice(project, slice);

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

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.quantity;
	expect(field).toMatchObject({
		type: "Number",
		config: { min: 0, max: 100 },
	});
});

it("edits select field options", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.color = {
		type: "Select",
		config: { label: "Color", options: ["red", "blue"] },
	};
	await writeLocalSlice(project, slice);

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

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.color;
	expect(field).toMatchObject({
		type: "Select",
		config: {
			default_value: "green",
			options: ["red", "green", "blue"],
		},
	});
});

it("edits content relationship field with --field", async ({ expect, prismic, project }) => {
	const target = buildCustomType({
		json: { Main: { title: { type: "Text", config: { label: "Title" } } } },
	});
	await writeLocalCustomType(project, target);

	const owner = buildCustomType();
	owner.json.Main.my_link = {
		type: "Link",
		config: { label: "My Link", select: "document", customtypes: [target.id] },
	};
	await writeLocalCustomType(project, owner);

	const { stdout, exitCode } = await prismic("field", [
		"edit",
		"my_link",
		"--from-type",
		owner.id,
		"--field",
		"title",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field updated: my_link");

	const updated = await readLocalCustomType(project, owner.id);
	expect(updated.json.Main.my_link).toMatchObject({
		type: "Link",
		config: {
			select: "document",
			customtypes: [{ id: target.id, fields: ["title"] }],
		},
	});
});

it("edits link field options", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.cta_link = {
		type: "Link",
		config: { label: "CTA Link", allowTargetBlank: false },
	};
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"edit",
		"cta_link",
		"--from-slice",
		slice.id,
		"--allow-target-blank",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field updated: cta_link");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.cta_link;
	expect(field).toMatchObject({
		type: "Link",
		config: { allowTargetBlank: true },
	});
});
