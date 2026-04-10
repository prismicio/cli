import { buildCustomType, buildSlice, it } from "./it";
import { getCustomTypes, getSlices, insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["add", "text", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add text <id> [options]");
});

it("adds a text field to a slice", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"text",
		"subtitle",
		"--to-slice",
		slice.name,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: subtitle");

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const field = updated!.variations[0].primary!.subtitle;
	expect(field).toMatchObject({ type: "Text" });
});

it("adds a text field to a custom type", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType();
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"text",
		"subtitle",
		"--to-type",
		customType.label!,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: subtitle");

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	const field = updated!.json.Main.subtitle;
	expect(field).toMatchObject({ type: "Text" });
});

it("adds a text field to a page type", async ({ expect, prismic, repo, token, host }) => {
	const pageType = buildCustomType({ format: "page" });
	await insertCustomType(pageType, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"text",
		"subtitle",
		"--to-type",
		pageType.label!,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: subtitle");

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === pageType.id);
	const field = updated!.json.Main.subtitle;
	expect(field).toMatchObject({ type: "Text" });
});
