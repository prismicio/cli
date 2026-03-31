import type { Group } from "@prismicio/types-internal/lib/customtypes";

import { buildCustomType, buildSlice, it } from "./it";
import { getCustomTypes, getSlices, insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["remove", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field remove <id> [options]");
});

it("removes a field from a slice", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice({
		variations: [
			{
				id: "default",
				name: "Default",
				docURL: "",
				version: "initial",
				description: "Default",
				imageUrl: "",
				primary: {
					my_field: { type: "Boolean", config: { label: "My Field" } },
				},
			},
		],
	});
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"remove",
		"my_field",
		"--from-slice",
		slice.name,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field removed: my_field");

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	expect(updated!.variations[0].primary!.my_field).toBeUndefined();
});

it("removes a field from a custom type", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({
		json: {
			Main: {
				title: { type: "StructuredText", config: { label: "Title" } },
			},
		},
	});
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"remove",
		"title",
		"--from-custom-type",
		customType.label!,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field removed: title");

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	expect(updated!.json.Main.title).toBeUndefined();
});

it("removes a nested field using dot notation", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice({
		variations: [
			{
				id: "default",
				name: "Default",
				docURL: "",
				version: "initial",
				description: "Default",
				imageUrl: "",
				primary: {
					my_group: {
						type: "Group",
						config: {
							label: "My Group",
							fields: {
								subtitle: { type: "StructuredText", config: { label: "Subtitle" } },
							},
						},
					},
				},
			},
		],
	});
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"remove",
		"my_group.subtitle",
		"--from-slice",
		slice.name,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field removed: my_group.subtitle");

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const group = updated!.variations[0].primary!.my_group as Group;
	expect(group.config?.fields).toMatchObject({});
	expect(group.config?.fields?.subtitle).toBeUndefined();
});
