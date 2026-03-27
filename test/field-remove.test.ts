import { readFile, mkdir, writeFile } from "node:fs/promises";

import { buildCustomType, buildSlice, it } from "./it";

const slice = buildSlice();
slice.variations[0].primary = {};
slice.variations[0].primary.my_field = { type: "Boolean", config: { label: "My Field" } };

const customType = buildCustomType();
customType.json.Main.title = { type: "StructuredText", config: { label: "Title" } };

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["remove", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field remove <id> [options]");
});

it("removes a field from a slice", async ({ expect, project, prismic }) => {
	const modelPath = new URL("slices/MySlice/model.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(slice));

	const { stdout, exitCode } = await prismic("field", [
		"remove",
		"my_field",
		"--to",
		"slices/MySlice",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field removed: my_field");

	const model = JSON.parse(await readFile(modelPath, "utf-8"));
	expect(model.variations[0].primary.my_field).toBeUndefined();
});

it("removes a field from a custom type", async ({ expect, project, prismic }) => {
	const modelPath = new URL("customtypes/my_type/index.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(customType));

	const { stdout, exitCode } = await prismic("field", [
		"remove",
		"title",
		"--to",
		"customtypes/my_type",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field removed: title");

	const model = JSON.parse(await readFile(modelPath, "utf-8"));
	expect(model.json.Main.title).toBeUndefined();
});
