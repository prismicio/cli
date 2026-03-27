import { mkdir, writeFile } from "node:fs/promises";

import { buildSlice, it } from "./it";

const slice = buildSlice();
slice.variations[0].primary = {};
slice.variations[0].primary.title = { type: "StructuredText", config: { label: "Title" } };
slice.variations[0].primary.is_active = { type: "Boolean", config: { label: "Is Active" } };

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["list", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field list [options]");
});

it("lists fields in a slice", async ({ expect, project, prismic }) => {
	const modelPath = new URL("slices/MySlice/model.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(slice));

	const { stdout, exitCode } = await prismic("field", ["list", "--to", "slices/MySlice"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("title");
	expect(stdout).toContain("StructuredText");
	expect(stdout).toContain("is_active");
	expect(stdout).toContain("Boolean");
});

it("lists fields as JSON with --json", async ({ expect, project, prismic }) => {
	const modelPath = new URL("slices/MySlice/model.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(slice));

	const { stdout, exitCode } = await prismic("field", ["list", "--to", "slices/MySlice", "--json"]);
	expect(exitCode).toBe(0);

	const fields = JSON.parse(stdout);
	expect(fields).toContainEqual({
		id: "title",
		type: "StructuredText",
		label: "Title",
	});
});

it("prints message when no fields exist", async ({ expect, project, prismic }) => {
	const modelPath = new URL("slices/MySlice/model.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(buildSlice()));

	const { stdout, exitCode } = await prismic("field", ["list", "--to", "slices/MySlice"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("No fields found.");
});
