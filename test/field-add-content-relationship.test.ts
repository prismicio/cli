import { readFile, mkdir, writeFile } from "node:fs/promises";

import { buildCustomType, buildSlice, it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["add", "content-relationship", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add content-relationship <id> [options]");
});

it("adds a content relationship field to a slice", async ({ expect, project, prismic }) => {
	const modelPath = new URL("slices/MySlice/model.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(buildSlice()));

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"content-relationship",
		"my_relation",
		"--to",
		"slices/MySlice",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_relation");

	const model = JSON.parse(await readFile(modelPath, "utf-8"));
	const field = model.variations[0].primary.my_relation;
	expect(field).toMatchObject({ type: "Link", config: { select: "document" } });
});

it("adds a content relationship field to a custom type", async ({ expect, project, prismic }) => {
	const modelPath = new URL("customtypes/my_type/index.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(buildCustomType()));

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"content-relationship",
		"my_relation",
		"--to",
		"customtypes/my_type",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_relation");

	const model = JSON.parse(await readFile(modelPath, "utf-8"));
	const field = model.json.Main.my_relation;
	expect(field).toMatchObject({ type: "Link", config: { select: "document" } });
});
