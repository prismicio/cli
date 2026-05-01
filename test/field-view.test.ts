import { buildCustomType, buildSlice, it, writeLocalCustomType, writeLocalSlice } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["view", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field view <id> [options]");
});

it("views a field in a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.title = {
		type: "StructuredText",
		config: { label: "Title", placeholder: "Enter title" },
	};
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", ["view", "title", "--from-slice", slice.id]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Type: StructuredText");
	expect(stdout).toContain("Label: Title");
	expect(stdout).toContain("Placeholder: Enter title");
});

it("views a field in a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	customType.json.Main.count = {
		type: "Number",
		config: { label: "Count", placeholder: "Enter number", min: 0, max: 100 },
	};
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("field", [
		"view",
		"count",
		"--from-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Type: Number");
	expect(stdout).toContain("Label: Count");
	expect(stdout).toContain("Min: 0");
	expect(stdout).toContain("Max: 100");
});

it("outputs JSON with --json", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.is_active = {
		type: "Boolean",
		config: { label: "Is Active", default_value: true },
	};
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"view",
		"is_active",
		"--from-slice",
		slice.id,
		"--json",
	]);
	expect(exitCode).toBe(0);

	const field = JSON.parse(stdout);
	expect(field.id).toBe("is_active");
	expect(field.type).toBe("Boolean");
	expect(field.config.label).toBe("Is Active");
});

it("errors for non-existent field", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stderr, exitCode } = await prismic("field", [
		"view",
		"nonexistent",
		"--from-slice",
		slice.id,
	]);
	expect(exitCode).not.toBe(0);
	expect(stderr).toContain("nonexistent");
});
