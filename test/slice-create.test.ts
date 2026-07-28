import { snakeCase } from "change-case";
import { writeFile } from "node:fs/promises";

import { buildSlice, it, readLocalSlice } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("slice", ["create", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic slice create <name> [options]");
});

it("creates a slice", async ({ expect, prismic, project }) => {
	const { name } = buildSlice();

	const { stdout, stderr, exitCode } = await prismic("slice", ["create", name]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Created slice "${name}"`);

	const id = snakeCase(name);
	const created = await readLocalSlice(project, id);
	expect(created).toBeDefined();
	expect(created?.name).toBe(name);
});

it("creates a slice with a custom id", async ({ expect, prismic, project }) => {
	const { name } = buildSlice();
	const id = `slice_${crypto.randomUUID().split("-")[0]}`;

	const { stdout, stderr, exitCode } = await prismic("slice", ["create", name, "--id", id]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Created slice "${name}" (id: "${id}")`);

	const created = await readLocalSlice(project, id);
	expect(created).toBeDefined();
});

it("creates a slice in the first configured library", async ({
	expect,
	prismic,
	project,
	repo,
}) => {
	await writeFile(
		new URL("prismic.config.json", project),
		JSON.stringify({
			repositoryName: repo,
			libraries: ["./slices/blog", "./slices/features"],
		}),
	);

	const { name } = buildSlice();
	const id = snakeCase(name);

	const { stderr, exitCode } = await prismic("slice", ["create", name]);
	expect(exitCode, stderr).toBe(0);

	const created = await readLocalSlice(project, id);
	expect(created).toBeDefined();
	await expect(project).toHaveFile(`slices/blog/${name}/model.json`);
	await expect(project).not.toHaveFile(`slices/${name}/model.json`);
});
