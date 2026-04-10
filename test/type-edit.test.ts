import { buildCustomType, it } from "./it";
import { getCustomTypes, insertCustomType } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("type", ["edit", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic type edit <name> [options]");
});

it("edits a type name", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({ format: "custom" });
	await insertCustomType(customType, { repo, token, host });

	const newName = `TypeT${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("type", ["edit", customType.label!, "--name", newName]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Type updated: "${newName}"`);

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	expect(updated?.label).toBe(newName);
});

it("edits a type format", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({ format: "custom" });
	await insertCustomType(customType, { repo, token, host });

	const { exitCode } = await prismic("type", ["edit", customType.label!, "--format", "page"]);
	expect(exitCode).toBe(0);

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	expect(updated?.format).toBe("page");
});

it("makes a type single", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({ format: "custom", repeatable: true });
	await insertCustomType(customType, { repo, token, host });

	const { exitCode } = await prismic("type", ["edit", customType.label!, "--single"]);
	expect(exitCode).toBe(0);

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	expect(updated?.repeatable).toBe(false);
});

it("rejects --repeatable with --single", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({ format: "custom" });
	await insertCustomType(customType, { repo, token, host });

	const { stderr, exitCode } = await prismic("type", [
		"edit",
		customType.label!,
		"--repeatable",
		"--single",
	]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Cannot use both");
});
