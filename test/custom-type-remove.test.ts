import { buildCustomType, it } from "./it";
import { getCustomTypes, insertCustomType } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("custom-type", ["remove", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic custom-type remove <name> [options]");
});

it("removes a custom type", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({ format: "custom" });
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("custom-type", ["remove", customType.label!]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Custom type removed: "${customType.label}" (id: ${customType.id})`);

	const customTypes = await getCustomTypes({ repo, token, host });
	const removed = customTypes.find((ct) => ct.id === customType.id);
	expect(removed).toBeUndefined();
});
