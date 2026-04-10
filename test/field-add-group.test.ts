import type { Group } from "@prismicio/types-internal/lib/customtypes";

import { buildCustomType, buildSlice, it } from "./it";
import { getCustomTypes, getSlices, insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["add", "group", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add group <id> [options]");
});

it("adds a group field to a slice", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"group",
		"my_group",
		"--to-slice",
		slice.name,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_group");

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const field = updated!.variations[0].primary!.my_group;
	expect(field).toMatchObject({ type: "Group" });
});

it("adds a group field to a custom type", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType();
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"group",
		"my_group",
		"--to-type",
		customType.label!,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_group");

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	const field = updated!.json.Main.my_group;
	expect(field).toMatchObject({ type: "Group" });
});

it("adds a field inside a group using dot syntax", async ({
	expect,
	prismic,
	repo,
	token,
	host,
}) => {
	const slice = buildSlice();
	slice.variations[0].primary!.my_group = { type: "Group", config: { label: "My Group" } };
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"text",
		"my_group.subtitle",
		"--to-slice",
		slice.name,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_group.subtitle");

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const group = updated!.variations[0].primary!.my_group as Group;
	expect(group.config?.fields).toMatchObject({
		subtitle: { type: "Text", config: { label: "Subtitle" } },
	});
});

it("errors when dot syntax targets a non-existent field", async ({
	expect,
	prismic,
	repo,
	token,
	host,
}) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stderr, exitCode } = await prismic("field", [
		"add",
		"text",
		"nonexistent.subtitle",
		"--to-slice",
		slice.name,
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Field "nonexistent" does not exist.');
});

it("errors when dot syntax targets a non-group field", async ({
	expect,
	prismic,
	repo,
	token,
	host,
}) => {
	const slice = buildSlice();
	slice.variations[0].primary!.my_text = { type: "Text", config: { label: "My Text" } };
	await insertSlice(slice, { repo, token, host });

	const { stderr, exitCode } = await prismic("field", [
		"add",
		"text",
		"my_text.subtitle",
		"--to-slice",
		slice.name,
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Field "my_text" is not a group field.');
});
