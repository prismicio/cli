import { readFile, mkdir, writeFile } from "node:fs/promises";

import { buildCustomType, buildSlice, it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["add", "image", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add image <id> [options]");
});

it("adds an image field to a slice", async ({ expect, project, prismic }) => {
	const modelPath = new URL("slices/MySlice/model.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(buildSlice()));

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"image",
		"my_image",
		"--to",
		"slices/MySlice",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_image");

	const model = JSON.parse(await readFile(modelPath, "utf-8"));
	const field = model.variations[0].primary.my_image;
	expect(field).toMatchObject({ type: "Image" });
});

it("adds an image field to a custom type", async ({ expect, project, prismic }) => {
	const modelPath = new URL("customtypes/my_type/index.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(buildCustomType()));

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"image",
		"my_image",
		"--to",
		"customtypes/my_type",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_image");

	const model = JSON.parse(await readFile(modelPath, "utf-8"));
	const field = model.json.Main.my_image;
	expect(field).toMatchObject({ type: "Image" });
});
