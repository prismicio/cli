import { buildCustomType, it, readLocalCustomType, writeLocalCustomType } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("type", ["add-tab", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic type add-tab <name> [options]");
});

it("adds a tab to a type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const tabName = `Tab${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("type", ["add-tab", tabName, "--to", customType.id]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Added tab "${tabName}" to "${customType.id}"`);

	const updated = await readLocalCustomType(project, customType.id);
	expect(updated.json).toHaveProperty(tabName);
	expect(updated.json[tabName]).toEqual({});
});

it("adds a tab with a slice zone", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const tabName = `Tab${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("type", [
		"add-tab",
		tabName,
		"--to",
		customType.id,
		"--with-slice-zone",
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Added tab "${tabName}" to "${customType.id}"`);

	const updated = await readLocalCustomType(project, customType.id);
	const tab = updated.json[tabName];
	expect(tab).toHaveProperty("slices");
	expect(tab.slices).toMatchObject({ type: "Slices" });
});
