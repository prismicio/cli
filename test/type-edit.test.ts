import { buildCustomType, it, readLocalCustomType, writeLocalCustomType } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("type", ["edit", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic type edit <id> [options]");
});

it("edits a type name", async ({ expect, prismic, project }) => {
	const customType = buildCustomType({ format: "custom" });
	await writeLocalCustomType(project, customType);

	const newName = `TypeT${crypto.randomUUID().split("-")[0]}`;

	const { stdout, stderr, exitCode } = await prismic("type", [
		"edit",
		customType.id,
		"--name",
		newName,
	]);
	expect(stderr).toBe("");
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Type updated: "${newName}" (id: ${customType.id})`);

	const updated = await readLocalCustomType(project, customType.id);
	expect(updated.label).toBe(newName);
});

it("edits a type format", async ({ expect, prismic, project }) => {
	const customType = buildCustomType({ format: "custom" });
	await writeLocalCustomType(project, customType);

	const { stderr, exitCode } = await prismic("type", ["edit", customType.id, "--format", "page"]);
	expect(stderr).toBe("");
	expect(exitCode).toBe(0);

	const updated = await readLocalCustomType(project, customType.id);
	expect(updated.format).toBe("page");
});
