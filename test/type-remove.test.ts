import { buildCustomType, it, readLocalCustomTypes, writeLocalCustomType } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("type", ["remove", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic type remove <id> [options]");
});

it("removes a type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType({ format: "custom" });
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("type", ["remove", customType.id]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Type removed: ${customType.id}`);

	const customTypes = await readLocalCustomTypes(project);
	const removed = customTypes.find((ct) => ct.id === customType.id);
	expect(removed).toBeUndefined();
});
