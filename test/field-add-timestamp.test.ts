import { readFile, mkdir, writeFile } from "node:fs/promises";

import { buildCustomType, buildSlice, it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", [
		"add",
		"timestamp",
		"--help",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add timestamp <id> [options]");
});

it("adds a timestamp field to a slice", async ({ expect, project, prismic }) => {
	const modelPath = new URL("slices/MySlice/model.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(buildSlice()));

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"timestamp",
		"created_at",
		"--to",
		"slices/MySlice",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: created_at");

	const model = JSON.parse(await readFile(modelPath, "utf-8"));
	const field = model.variations[0].primary.created_at;
	expect(field).toMatchObject({ type: "Timestamp" });
});

it("adds a timestamp field to a custom type", async ({ expect, project, prismic }) => {
	const modelPath = new URL("customtypes/my_type/index.json", project);
	await mkdir(new URL(".", modelPath), { recursive: true });
	await writeFile(modelPath, JSON.stringify(buildCustomType()));

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"timestamp",
		"created_at",
		"--to",
		"customtypes/my_type",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: created_at");

	const model = JSON.parse(await readFile(modelPath, "utf-8"));
	const field = model.json.Main.created_at;
	expect(field).toMatchObject({ type: "Timestamp" });
});
