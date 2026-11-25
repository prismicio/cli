import { mkdir, writeFile } from "node:fs/promises";
import { sep } from "node:path";

import { buildSlice, it, readLocalSlice, writeLocalSlice } from "./it";

it("prints help by default", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("field", ["add"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic field add <command> [options]");
});

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("field", ["add", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic field add <command> [options]");
	expect(stdout).toContain("prismic docs view fields");
});

it("validates only the model it changes", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);
	const invalidSlice = buildSlice();
	const invalidPath = new URL(`slices/${invalidSlice.name}/model.json`, project);
	await mkdir(new URL(".", invalidPath), { recursive: true });
	await writeFile(invalidPath, JSON.stringify({ ...invalidSlice, description: 1 }));

	const added = await prismic("field", ["add", "text", "subtitle", "--to-slice", slice.id]);
	expect(added.exitCode, added.stderr).toBe(0);
	const updated = await readLocalSlice(project, slice.id);
	expect(updated!.variations[0].primary!.subtitle).toMatchObject({ type: "Text" });

	const invalid = await prismic("field", ["add", "text", "title", "--to-slice", invalidSlice.id]);
	expect(invalid.exitCode).toBe(1);
	expect(invalid.stderr).toContain(
		`${["slices", invalidSlice.name, "model.json"].join(sep)}:\n✖ Invalid input: expected string, received number\n→ at description`,
	);
});
