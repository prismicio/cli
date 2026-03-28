import { readFile, mkdir, writeFile } from "node:fs/promises";

import { buildCustomType, buildSlice, it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["add", "group", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add group <id> [options]");
});

it("adds a group field to a slice", async ({ expect, project, prismic }) => {
	const modelPath = new URL("slices/MySlice/model.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(buildSlice()));

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"group",
		"my_group",
		"--to",
		"slices/MySlice",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_group");

	const model = JSON.parse(await readFile(modelPath, "utf-8"));
	const field = model.variations[0].primary.my_group;
	expect(field).toMatchObject({ type: "Group" });
});

it("adds a group field to a custom type", async ({ expect, project, prismic }) => {
	const modelPath = new URL("customtypes/my_type/index.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(buildCustomType()));

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"group",
		"my_group",
		"--to",
		"customtypes/my_type",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_group");

	const model = JSON.parse(await readFile(modelPath, "utf-8"));
	const field = model.json.Main.my_group;
	expect(field).toMatchObject({ type: "Group" });
});

it("adds a field inside a group in a slice using dot syntax", async ({
	expect,
	project,
	prismic,
}) => {
	const modelPath = new URL("slices/MySlice/model.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });

	const slice = buildSlice();
	slice.variations[0].primary!.my_group = { type: "Group", config: { label: "My Group" } };
	await writeFile(modelPath, JSON.stringify(slice));

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"text",
		"my_group.subtitle",
		"--to",
		"slices/MySlice",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_group.subtitle");

	const model = JSON.parse(await readFile(modelPath, "utf-8"));
	const field = model.variations[0].primary.my_group.config.fields.subtitle;
	expect(field).toMatchObject({ type: "Text", config: { label: "Subtitle" } });
});

it("adds a field inside a group in a custom type using dot syntax", async ({
	expect,
	project,
	prismic,
}) => {
	const modelPath = new URL("customtypes/my_type/index.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });

	const customType = buildCustomType();
	customType.json.Main.my_group = { type: "Group", config: { label: "My Group" } };
	await writeFile(modelPath, JSON.stringify(customType));

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"text",
		"my_group.subtitle",
		"--to",
		"customtypes/my_type",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_group.subtitle");

	const model = JSON.parse(await readFile(modelPath, "utf-8"));
	const field = model.json.Main.my_group.config.fields.subtitle;
	expect(field).toMatchObject({ type: "Text", config: { label: "Subtitle" } });
});

it("errors when dot syntax targets a non-existent field", async ({ expect, project, prismic }) => {
	const modelPath = new URL("slices/MySlice/model.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(buildSlice()));

	const { stderr, exitCode } = await prismic("field", [
		"add",
		"text",
		"nonexistent.subtitle",
		"--to",
		"slices/MySlice",
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Field "nonexistent" does not exist.');
});

it("errors when dot syntax targets a non-group field", async ({ expect, project, prismic }) => {
	const modelPath = new URL("slices/MySlice/model.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });

	const slice = buildSlice();
	slice.variations[0].primary!.my_text = { type: "Text", config: { label: "My Text" } };
	await writeFile(modelPath, JSON.stringify(slice));

	const { stderr, exitCode } = await prismic("field", [
		"add",
		"text",
		"my_text.subtitle",
		"--to",
		"slices/MySlice",
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Field "my_text" is not a group field.');
});
