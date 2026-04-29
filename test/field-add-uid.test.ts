import { buildCustomType, it, readLocalCustomType, writeLocalCustomType } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["add", "uid", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add uid [options]");
});

it("adds a uid field to a custom type", async ({ expect, prismic, project }) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("field", ["add", "uid", "--to-type", customType.id]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: uid");

	const updated = await readLocalCustomType(project, customType.id);
	const field = updated.json.Main.uid;
	expect(field).toMatchObject({ type: "UID" });
});

it("adds a uid field to a page type", async ({ expect, prismic, project }) => {
	const pageType = buildCustomType({ format: "page" });
	await writeLocalCustomType(project, pageType);

	const { stdout, exitCode } = await prismic("field", ["add", "uid", "--to-type", pageType.id]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: uid");

	const updated = await readLocalCustomType(project, pageType.id);
	const field = updated.json.Main.uid;
	expect(field).toMatchObject({ type: "UID" });
});
