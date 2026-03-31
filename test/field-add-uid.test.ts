import { buildCustomType, it } from "./it";
import { getCustomTypes, insertCustomType } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["add", "uid", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add uid [options]");
});

it("adds a uid field to a custom type", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType();
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"uid",
		"--to-custom-type",
		customType.label!,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: uid");

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	const field = updated!.json.Main.uid;
	expect(field).toMatchObject({ type: "UID" });
});

it("adds a uid field to a page type", async ({ expect, prismic, repo, token, host }) => {
	const pageType = buildCustomType({ format: "page" });
	await insertCustomType(pageType, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"uid",
		"--to-page-type",
		pageType.label!,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: uid");

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === pageType.id);
	const field = updated!.json.Main.uid;
	expect(field).toMatchObject({ type: "UID" });
});
