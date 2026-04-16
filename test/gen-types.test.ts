import { mkdir, writeFile } from "node:fs/promises";

import { buildCustomType, buildSlice, it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("gen", ["types", "--help"]);
	expect(exitCode).toBe(0);
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

	const { exitCode, stdout } = await prismic("gen", ["types"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Updated prismicio-types.d.ts");

	await expect(project).toHaveFile("prismicio-types.d.ts", {
		contains: customType.id,
	});
});

it("generates types with no models", async ({ expect, project, prismic }) => {
	const { exitCode, stdout } = await prismic("gen", ["types"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Updated prismicio-types.d.ts");

	await expect(project).toHaveFile("prismicio-types.d.ts");
});
