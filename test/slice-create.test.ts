import { writeFile } from "node:fs/promises";
import { sep } from "node:path";

import type { DynamicSlicesModel } from "@prismicio/types-internal";
import { snakeCase } from "change-case";

import {
	buildCustomType,
	buildSlice,
	it,
	readLocalCustomType,
	readLocalSlice,
	writeLocalCustomType,
} from "./it";

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

it("quotes the slice ID in the slice index file", async ({ expect, prismic, project }) => {
	const { name, id: baseId } = buildSlice();
	const id = `with-dash-${baseId}`;

	const { stderr, exitCode } = await prismic("slice", ["create", name, "--id", id]);
	expect(exitCode, stderr).toBe(0);

	await expect(project).toHaveFile("slices/index.js", { contains: `"${id}": ${name}` });
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

it("refuses to replace an existing slice", async ({ expect, prismic, project }) => {
	const { name } = buildSlice();
	const id = snakeCase(name);
	const message = `A slice already exists at ${["slices", name, ""].join(sep)} (id: ${id})`;

	const first = await prismic("slice", ["create", name]);
	expect(first.exitCode, first.stderr).toBe(0);

	const edited = { ...(await readLocalSlice(project, id)), description: "Edited" };
	await writeFile(new URL(`slices/${name}/model.json`, project), JSON.stringify(edited));
	await writeFile(new URL(`slices/${name}/index.jsx`, project), "// edited");

	const sameId = await prismic("slice", ["create", name]);
	expect(sameId.exitCode).toBe(1);
	expect(sameId.stderr).toContain(message);

	const otherId = await prismic("slice", ["create", name, "--id", `${id}_two`]);
	expect(otherId.exitCode).toBe(1);
	expect(otherId.stderr).toContain(message);

	expect(await readLocalSlice(project, id)).toEqual(edited);
	expect(await readLocalSlice(project, `${id}_two`)).toBeUndefined();
	await expect(project).toHaveFile(`slices/${name}/index.jsx`, { contains: "// edited" });
});

it("rejects an unquoted name with spaces", async ({ expect, prismic, project }) => {
	const { name } = buildSlice();

	const { stderr, exitCode } = await prismic("slice", ["create", name, "Block"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Unexpected argument: "Block"');
	expect(stderr).toContain("Usage: prismic slice create <name> [options]");
	expect(await readLocalSlice(project, snakeCase(name))).toBeUndefined();
});

it("connects the slice to a type with --to", async ({ expect, prismic, project }) => {
	const { name } = buildSlice();
	const id = snakeCase(name);
	const customType = buildCustomType({
		format: "page",
		json: { Main: { slices: { type: "Slices", config: { choices: {} } } } },
	});
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("slice", [
		"create",
		name,
		"--to",
		customType.id,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Connected slice "${id}" to "${customType.id}"`);

	const updated = await readLocalCustomType(project, customType.id);
	expect((updated.json.Main.slices as DynamicSlicesModel).config!.choices).toEqual({
		[id]: { type: "SharedSlice" },
	});
});

it("creates no slice when --to has no slice zone", async ({ expect, prismic, project }) => {
	const { name } = buildSlice();
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stderr, exitCode } = await prismic("slice", ["create", name, "--to", customType.id]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain(`"${customType.id}" has no slice zone.`);
	expect(await readLocalSlice(project, snakeCase(name))).toBeUndefined();
});
