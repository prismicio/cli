import type { DynamicSlices } from "@prismicio/types-internal/lib/customtypes";

import {
	buildCustomType,
	buildSlice,
	it,
	readLocalCustomType,
	writeLocalCustomType,
	writeLocalSlice,
} from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["disconnect", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice disconnect <id> [options]");
});

it("disconnects a slice from a type", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	const customType = buildCustomType({
		format: "page",
		json: {
			Main: {
				slices: {
					type: "Slices",
					fieldset: "Slice Zone",
					config: { choices: { [slice.id]: { type: "SharedSlice" } } },
				},
			},
		},
	});

	await writeLocalSlice(project, slice);
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("slice", [
		"disconnect",
		slice.id,
		"--from",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Disconnected slice "${slice.id}" from "${customType.id}"`);

	const updated = await readLocalCustomType(project, customType.id);
	const choices = (updated.json.Main.slices as DynamicSlices).config!.choices!;
	expect(choices[slice.id]).toBeUndefined();
});
