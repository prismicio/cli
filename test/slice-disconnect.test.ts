import type { DynamicSlices } from "@prismicio/types-internal/lib/customtypes";

import { buildCustomType, buildSlice, it } from "./it";
import { getCustomTypes, insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["disconnect", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice disconnect <name> [options]");
});

it("disconnects a slice from a type", async ({ expect, prismic, repo, token, host }) => {
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

	await insertSlice(slice, { repo, token, host });
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("slice", [
		"disconnect",
		slice.name,
		"--from",
		customType.label!,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Disconnected slice "${slice.name}" from "${customType.label}"`);

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	const choices = (updated!.json.Main.slices as DynamicSlices).config!.choices!;
	expect(choices[slice.id]).toBeUndefined();
});
