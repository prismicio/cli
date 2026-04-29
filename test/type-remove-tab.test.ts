import { buildCustomType, it, readLocalCustomType, writeLocalCustomType } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("type", ["remove-tab", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic type remove-tab <name> [options]");
});

it("removes a tab from a type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType({ json: { Main: {}, Extra: {} } });
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("type", [
		"remove-tab",
		"Extra",
		"--from",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Removed tab "Extra" from "${customType.id}"`);

	const updated = await readLocalCustomType(project, customType.id);
	expect(updated.json).not.toHaveProperty("Extra");
	expect(updated.json).toHaveProperty("Main");
});
