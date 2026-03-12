import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { readFile } from "node:fs/promises";

import { captureOutput, it } from "./it";
import { insertCustomType, insertSlice } from "./prismic";

const PRISMIC_HOST = process.env.PRISMIC_HOST ?? "prismic.io";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("sync", ["--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("USAGE");
});

it("syncs slices and custom types from remote", async ({
	expect,
	project,
	prismic,
	repo,
	token,
}) => {
	const customType = buildCustomType();
	const slice = buildSlice();

	await insertCustomType(customType, { repo, token, host: PRISMIC_HOST });
	await insertSlice(slice, { repo, token, host: PRISMIC_HOST });

	const { exitCode, stdout } = await prismic("sync", ["--repo", repo]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Sync complete");

	const customTypeModel = JSON.parse(
		await readFile(new URL(`customtypes/${customType.id}/index.json`, project), "utf-8"),
	);
	expect(customTypeModel.id).toBe(customType.id);

	const sliceModel = JSON.parse(
		await readFile(new URL(`slices/${slice.name}/model.json`, project), "utf-8"),
	);
	expect(sliceModel.id).toBe(slice.id);
}, 60_000);

it("watches for changes and syncs", async ({ expect, project, prismic, repo, token }) => {
	const customType = buildCustomType();
	const slice = buildSlice();

	const proc = prismic("sync", ["--repo", repo, "--watch"]);
	const output = captureOutput(proc);

	await expect.poll(output, { timeout: 30_000 }).toContain("Watching for changes");

	await insertCustomType(customType, { repo, token, host: PRISMIC_HOST });
	await insertSlice(slice, { repo, token, host: PRISMIC_HOST });

	await expect.poll(output, { timeout: 30_000 }).toContain("Changes detected");

	const customTypeModel = JSON.parse(
		await readFile(new URL(`customtypes/${customType.id}/index.json`, project), "utf-8"),
	);
	expect(customTypeModel.id).toBe(customType.id);

	const sliceModel = JSON.parse(
		await readFile(new URL(`slices/${slice.name}/model.json`, project), "utf-8"),
	);
	expect(sliceModel.id).toBe(slice.id);
}, 60_000);

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
