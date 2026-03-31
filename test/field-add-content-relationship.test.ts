import { buildCustomType, buildSlice, it } from "./it";
import { getCustomTypes, getSlices, insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["add", "content-relationship", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add content-relationship <id> [options]");
});

it("adds a content relationship field to a slice", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"content-relationship",
		"my_link",
		"--to-slice",
		slice.name,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_link");

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const field = updated!.variations[0].primary!.my_link;
	expect(field).toMatchObject({ type: "Link", config: { select: "document" } });
});

it("adds a content relationship field to a custom type", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType();
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"content-relationship",
		"my_link",
		"--to-custom-type",
		customType.label!,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_link");

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	const field = updated!.json.Main.my_link;
	expect(field).toMatchObject({ type: "Link", config: { select: "document" } });
});
