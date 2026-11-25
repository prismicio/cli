import { mkdir, writeFile } from "node:fs/promises";
import { sep } from "node:path";

import { buildCustomType, buildSlice, it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("gen", ["types", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic gen types [options]");
});

it("generates types from local models", async ({ expect, project, prismic }) => {
	const customType = buildCustomType();
	const customTypePath = new URL(`customtypes/${customType.id}/index.json`, project);
	await mkdir(new URL(".", customTypePath), { recursive: true });
	await writeFile(customTypePath, JSON.stringify(customType));

	const slice = buildSlice();
	const slicePath = new URL(`slices/${slice.name}/model.json`, project);
	await mkdir(new URL(".", slicePath), { recursive: true });
	await writeFile(slicePath, JSON.stringify(slice));

	const { stderr, exitCode, stdout } = await prismic("gen", ["types"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Generated types");

	await expect(project).toHaveFile("prismicio-types.d.ts", {
		contains: customType.id,
	});
});

it("generates types with no models", async ({ expect, project, prismic }) => {
	const { stderr, exitCode, stdout } = await prismic("gen", ["types"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Generated types");

	await expect(project).toHaveFile("prismicio-types.d.ts");
});

it("names a local model file that is invalid", async ({ expect, project, prismic }) => {
	const { variations: _, ...slice } = buildSlice();
	const slicePath = new URL(`slices/${slice.name}/model.json`, project);
	await mkdir(new URL(".", slicePath), { recursive: true });
	await writeFile(slicePath, JSON.stringify(slice));
	const file = ["slices", slice.name, "model.json"].join(sep);

	const { stderr, exitCode } = await prismic("gen", ["types"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain(`${file}: variations must be an array`);
	expect(stderr).not.toContain("reached a bug");

	await writeFile(slicePath, "{");
	const invalidJson = await prismic("gen", ["types"]);
	expect(invalidJson.exitCode).toBe(1);
	expect(invalidJson.stderr).toContain(`${file} is not valid JSON.`);
});
