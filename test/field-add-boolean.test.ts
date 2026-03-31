import { buildCustomType, buildSlice, it } from "./it";
import { getCustomTypes, getSlices, insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["add", "boolean", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add boolean <id> [options]");
});

it("adds a boolean field to a slice", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"boolean",
		"my_field",
		"--to-slice",
		slice.name,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_field");

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const field = updated!.variations[0].primary!.my_field;
	expect(field).toMatchObject({ type: "Boolean" });
});

it("adds a boolean field to a custom type", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType();
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"boolean",
		"is_active",
		"--to-custom-type",
		customType.label!,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: is_active");

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	const field = updated!.json.Main.is_active;
	expect(field).toMatchObject({ type: "Boolean" });
});
