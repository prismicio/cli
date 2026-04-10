import { buildCustomType, it } from "./it";
import { getCustomTypes, insertCustomType } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("type", ["remove-tab", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic type remove-tab <name> [options]");
});

it("removes a tab from a type", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({ json: { Main: {}, Extra: {} } });
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("type", [
		"remove-tab",
		"Extra",
		"--from",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Removed tab "Extra" from "${customType.id}"`);

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	expect(updated?.json).not.toHaveProperty("Extra");
	expect(updated?.json).toHaveProperty("Main");
});
