import { buildCustomType, it } from "./it";
import { getCustomTypes, insertCustomType } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("type", ["edit-tab", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic type edit-tab <name> [options]");
});

it("edits a tab name", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({ json: { Main: {}, OldName: {} } });
	await insertCustomType(customType, { repo, token, host });

	const newName = `Tab${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("type", [
		"edit-tab",
		"OldName",
		"--in",
		customType.label!,
		"--name",
		newName,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Tab updated: "OldName" in "${customType.label}"`);

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	expect(updated?.json).not.toHaveProperty("OldName");
	expect(updated?.json).toHaveProperty(newName);
});

it("adds a slice zone to a tab", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType();
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("type", [
		"edit-tab",
		"Main",
		"--in",
		customType.label!,
		"--with-slice-zone",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Tab updated: "Main" in "${customType.label}"`);

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	expect(updated?.json.Main).toHaveProperty("slices");
	expect(updated?.json.Main.slices).toMatchObject({ type: "Slices" });
});

it("removes a slice zone from a tab", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({
		json: {
			Main: {
				slices: {
					type: "Slices",
					fieldset: "Slice Zone",
					config: { choices: {} },
				},
			},
		},
	});
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("type", [
		"edit-tab",
		"Main",
		"--in",
		customType.label!,
		"--without-slice-zone",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Tab updated: "Main" in "${customType.label}"`);

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	expect(updated?.json.Main).not.toHaveProperty("slices");
});
