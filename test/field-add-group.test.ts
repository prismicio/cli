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
	const { stdout, exitCode } = await prismic("field", ["add", "group", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add group <id> [options]");
});

it("adds a group field to a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"group",
		"my_group",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_group");

	const updated = await readLocalSlice(project, slice.id);
	const field = updated!.variations[0].primary!.my_group;
	expect(field).toMatchObject({ type: "Group" });
});

it("adds a group field to a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"group",
		"my_group",
		"--to-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_group");

	const updated = await readLocalCustomType(project, customType.id);
	const field = updated.json.Main.my_group;
	expect(field).toMatchObject({ type: "Group" });
});

it("adds a field inside a group using dot syntax", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.my_group = { type: "Group", config: { label: "My Group" } };
	await writeLocalSlice(project, slice);

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"text",
		"my_group.subtitle",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_group.subtitle");

	const updated = await readLocalSlice(project, slice.id);
	const group = updated!.variations[0].primary!.my_group as Group;
	expect(group.config?.fields).toMatchObject({
		subtitle: { type: "Text", config: { label: "Subtitle" } },
	});
});

it("errors when dot syntax targets a non-existent field", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stderr, exitCode } = await prismic("field", [
		"add",
		"text",
		"nonexistent.subtitle",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Field "nonexistent" does not exist.');
});

it("errors when dot syntax targets a non-group field", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	slice.variations[0].primary!.my_text = { type: "Text", config: { label: "My Text" } };
	await writeLocalSlice(project, slice);

	const { stderr, exitCode } = await prismic("field", [
		"add",
		"text",
		"my_text.subtitle",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Field "my_text" is not a group field.');
});
