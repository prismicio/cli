import { mkdir, writeFile } from "node:fs/promises";

import { buildSlice, it, writeLocalSlice } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("gen", ["slice-index", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic gen slice-index [options]");
});

it("generates a slice index file", async ({ expect, project, prismic }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stderr, exitCode, stdout } = await prismic("gen", ["slice-index"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Generated the slice index file.");

	await expect(project).toHaveFile("slices/index.js", { contains: slice.id });
});

it("generates an index file for each slice library", async ({ expect, project, prismic }) => {
	const sliceA = buildSlice();
	const sliceB = buildSlice();
	await writeFile(
		new URL("prismic.config.json", project),
		JSON.stringify({ repositoryName: "example", libraries: ["./slices/a", "./slices/b"] }),
	);
	for (const [library, slice] of [
		["a", sliceA],
		["b", sliceB],
	] as const) {
		const path = new URL(`slices/${library}/${slice.name}/model.json`, project);
		await mkdir(new URL(".", path), { recursive: true });
		await writeFile(path, JSON.stringify(slice));
	}

	const { stderr, exitCode, stdout } = await prismic("gen", ["slice-index"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Generated 2 slice index files.");

	await expect(project).toHaveFile("slices/a/index.js", { contains: sliceA.id });
	await expect(project).toHaveFile("slices/b/index.js", { contains: sliceB.id });
});
