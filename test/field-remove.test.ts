import type { Group } from "@prismicio/types-internal/lib/customtypes";

import {
	buildCustomType,
	buildSlice,
	it,
	readLocalCustomType,
	readLocalSlice,
	writeLocalCustomType,
	writeLocalSlice,
} from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["remove", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field remove <id> [options]");
});

it("removes a field from a slice", async ({ expect, prismic, project }) => {
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
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"remove",
		"my_field",
		"--from-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field removed: my_field");

	const updated = await readLocalSlice(project, slice.id);
	expect(updated!.variations[0].primary!.my_field).toBeUndefined();
});

it("removes a field from a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType({
		json: {
			Main: {
				title: { type: "StructuredText", config: { label: "Title" } },
			},
		},
	});
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("field", [
		"remove",
		"title",
		"--from-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field removed: title");

	const updated = await readLocalCustomType(project, customType.id);
	expect(updated.json.Main.title).toBeUndefined();
});

it("removes a nested field using dot notation", async ({ expect, prismic, project }) => {
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
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"remove",
		"my_group.subtitle",
		"--from-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field removed: my_group.subtitle");

	const updated = await readLocalSlice(project, slice.id);
	const group = updated!.variations[0].primary!.my_group as Group;
	expect(group.config?.fields).toMatchObject({});
	expect(group.config?.fields?.subtitle).toBeUndefined();
});
