import { buildCustomType, buildSlice, it } from "./it";
import { getCustomTypes, getSlices, insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["add", "link-to-media", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add link-to-media <id> [options]");
});

it("adds a link to media field to a slice", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"link-to-media",
		"my_media",
		"--to-slice",
		slice.name,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_media");

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const field = updated!.variations[0].primary!.my_media;
	expect(field).toMatchObject({ type: "Link", config: { select: "media" } });
});

it("adds a link to media field to a custom type", async ({
	expect,
	prismic,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType();
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"link-to-media",
		"my_media",
		"--to-type",
		customType.label!,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_media");

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	const field = updated!.json.Main.my_media;
	expect(field).toMatchObject({ type: "Link", config: { select: "media" } });
});
