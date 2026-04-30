import { buildCustomType, it, readLocalCustomType, writeLocalCustomType } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("type", ["edit-tab", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic type edit-tab <name> [options]");
});

it("edits a tab name", async ({ expect, prismic, project }) => {
	const customType = buildCustomType({ json: { Main: {}, OldName: {} } });
	await writeLocalCustomType(project, customType);

	const newName = `Tab${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("type", [
		"edit-tab",
		"OldName",
		"--from-type",
		customType.id,
		"--name",
		newName,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Tab updated: "OldName" in "${customType.id}"`);

	const updated = await readLocalCustomType(project, customType.id);
	expect(updated.json).not.toHaveProperty("OldName");
	expect(updated.json).toHaveProperty(newName);
});

it("adds a slice zone to a tab", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("type", [
		"edit-tab",
		"Main",
		"--from-type",
		customType.id,
		"--with-slice-zone",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Tab updated: "Main" in "${customType.id}"`);

	const updated = await readLocalCustomType(project, customType.id);
	expect(updated.json.Main).toHaveProperty("slices");
	expect(updated.json.Main.slices).toMatchObject({ type: "Slices" });
});

it("removes a slice zone from a tab", async ({ expect, prismic, project }) => {
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
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("type", [
		"edit-tab",
		"Main",
		"--from-type",
		customType.id,
		"--without-slice-zone",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Tab updated: "Main" in "${customType.id}"`);

	const updated = await readLocalCustomType(project, customType.id);
	expect(updated.json.Main).not.toHaveProperty("slices");
});
