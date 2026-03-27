import { readFile, mkdir, writeFile } from "node:fs/promises";

import { buildCustomType, buildSlice, it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["add", "uid", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add uid [options]");
});

it("adds a uid field to a custom type", async ({ expect, project, prismic }) => {
	const modelPath = new URL("customtypes/my_type/index.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(buildCustomType()));

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"uid",
		"--to",
		"customtypes/my_type",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: uid");

	const model = JSON.parse(await readFile(modelPath, "utf-8"));
	const field = model.json.Main.uid;
	expect(field).toMatchObject({ type: "UID" });
});

it("errors when targeting a slice", async ({ expect, project, prismic }) => {
	const modelPath = new URL("slices/MySlice/model.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(buildSlice()));

	const { stderr, exitCode } = await prismic("field", [
		"add",
		"uid",
		"--to",
		"slices/MySlice",
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("can only be added to custom types");
});
