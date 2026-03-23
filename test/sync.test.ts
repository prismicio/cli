import type {
	CustomType,
	SharedSlice,
} from "@prismicio/types-internal/lib/customtypes";
import type { ExpectStatic } from "vitest";

import { readFile, stat } from "node:fs/promises";

import { captureOutput, it } from "./it";
import { deleteSlice, insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("sync", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic sync [options]");
});

it("syncs slices and custom types from remote", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType();
	const slice = buildSlice();

	await insertCustomType(customType, { repo, token, host });
	await insertSlice(slice, { repo, token, host });

	const { exitCode, stdout } = await prismic("sync", ["--repo", repo]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Sync complete");

	const customTypeModel = JSON.parse(
		await readFile(
			new URL(`customtypes/${customType.id}/index.json`, project),
			"utf-8",
		),
	);
	expect(customTypeModel.id).toBe(customType.id);

	await assertSliceStructure({ project, slice, expect });
}, 60_000);

it("syncs multiple slices with correct structure", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const sliceA = buildSlice();
	const sliceB = buildSlice();

	await insertSlice(sliceA, { repo, token, host });
	await insertSlice(sliceB, { repo, token, host });

	const { exitCode } = await prismic("sync", ["--repo", repo]);
	expect(exitCode).toBe(0);

	// Both slices have correct structure
	await assertSliceStructure({ project, slice: sliceA, expect });
	await assertSliceStructure({ project, slice: sliceB, expect });

	// Both slices are registered in the same index file
	await assertSliceLibraryIndex({
		project,
		expect,
		includes: [sliceA, sliceB],
	});
}, 60_000);

it("adds new slice to existing library on re-sync", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const sliceA = buildSlice();
	await insertSlice(sliceA, { repo, token, host });

	// First sync — creates slice A
	const first = await prismic("sync", ["--repo", repo]);
	expect(first.exitCode).toBe(0);
	await assertSliceStructure({ project, slice: sliceA, expect });

	// Insert a second slice remotely
	const sliceB = buildSlice();
	await insertSlice(sliceB, { repo, token, host });

	// Second sync — should add slice B without breaking slice A
	const second = await prismic("sync", ["--repo", repo]);
	expect(second.exitCode).toBe(0);

	// Both slices have correct structure
	await assertSliceStructure({ project, slice: sliceA, expect });
	await assertSliceStructure({ project, slice: sliceB, expect });

	// Slice A's component file was not overwritten (still exists)
	const componentA = await stat(
		new URL(`slices/${sliceA.name}/index.jsx`, project),
	);
	expect(componentA.isFile()).toBe(true);

	// Index file contains both slices
	await assertSliceLibraryIndex({
		project,
		expect,
		includes: [sliceA, sliceB],
	});
}, 60_000);

it("removes deleted slice and updates index on re-sync", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const sliceA = buildSlice();
	const sliceB = buildSlice();

	await insertSlice(sliceA, { repo, token, host });
	await insertSlice(sliceB, { repo, token, host });

	// First sync — creates both slices
	const first = await prismic("sync", ["--repo", repo]);
	expect(first.exitCode).toBe(0);
	await assertSliceStructure({ project, slice: sliceA, expect });
	await assertSliceStructure({ project, slice: sliceB, expect });

	// Delete slice B from remote
	await deleteSlice(sliceB.id, { repo, token, host });

	// Second sync — should remove slice B and update the index
	const second = await prismic("sync", ["--repo", repo]);
	expect(second.exitCode).toBe(0);

	// Slice A still has correct structure
	await assertSliceStructure({ project, slice: sliceA, expect });

	// Slice B's directory was removed
	const sliceBExists = await stat(
		new URL(`slices/${sliceB.name}`, project),
	).catch(() => null);
	expect(sliceBExists).toBeNull();

	// Index file only contains slice A, not slice B
	await assertSliceLibraryIndex({
		project,
		expect,
		includes: [sliceA],
		excludes: [sliceB],
	});
}, 60_000);

it("watches for changes and syncs", async ({
	expect,
	project,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType();
	const slice = buildSlice();

	const proc = prismic("sync", ["--repo", repo, "--watch"]);
	const output = captureOutput(proc);

	await expect
		.poll(output, { timeout: 30_000 })
		.toContain("Watching for changes");

	await insertCustomType(customType, { repo, token, host });
	await insertSlice(slice, { repo, token, host });

	await expect.poll(output, { timeout: 30_000 }).toContain("Changes detected");

	const customTypeModel = JSON.parse(
		await readFile(
			new URL(`customtypes/${customType.id}/index.json`, project),
			"utf-8",
		),
	);
	expect(customTypeModel.id).toBe(customType.id);

	await assertSliceStructure({ project, slice, expect });
}, 60_000);

function sliceComponentDefinitionPattern(slice: SharedSlice): RegExp {
	return new RegExp(`${slice.id}:\\s*${slice.name}`);
}

async function assertSliceLibraryIndex(args: {
	project: URL;
	expect: ExpectStatic;
	includes: SharedSlice[];
	excludes?: SharedSlice[];
}): Promise<void> {
	const { project, expect, includes, excludes = [] } = args;
	const sliceIndex = await readFile(
		new URL("slices/index.js", project),
		"utf-8",
	);
	expect(sliceIndex).toContain("components");
	for (const slice of includes) {
		expect(sliceIndex).toMatch(sliceComponentDefinitionPattern(slice));
	}
	for (const slice of excludes) {
		expect(sliceIndex).not.toMatch(sliceComponentDefinitionPattern(slice));
	}
}

async function assertSliceStructure(args: {
	project: URL;
	slice: SharedSlice;
	expect: ExpectStatic;
}): Promise<void> {
	const { project, slice, expect } = args;
	// model.json exists inside the slice directory
	const sliceModel = JSON.parse(
		await readFile(
			new URL(`slices/${slice.name}/model.json`, project),
			"utf-8",
		),
	);
	expect(sliceModel.id).toBe(slice.id);

	// Component file exists inside the slice directory (not at slices/ root)
	const componentFile = await readFile(
		new URL(`slices/${slice.name}/index.jsx`, project),
		"utf-8",
	);
	expect(componentFile).toContain(slice.name);

	// Slice is registered in the library index file
	await assertSliceLibraryIndex({ project, expect, includes: [slice] });
}

function buildCustomType(): CustomType {
	const id = crypto.randomUUID().split("-")[0];
	return {
		id: `type-T${id}`,
		label: `TypeT${id}`,
		repeatable: true,
		status: true,
		json: {},
	};
}

function buildSlice(): SharedSlice {
	const id = crypto.randomUUID().split("-")[0];
	return {
		id: `slice-S${id}`,
		type: "SharedSlice",
		name: `SliceS${id}`,
		variations: [
			{
				id: "default",
				name: "Default",
				docURL: "",
				version: "initial",
				description: "Default",
				imageUrl: "",
			},
		],
	};
}
