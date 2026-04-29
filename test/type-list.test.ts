import { buildCustomType, it, writeLocalCustomType } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("type", ["list", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic type list [options]");
});

it("lists all types", async ({ expect, prismic, project }) => {
	const customType = buildCustomType({ format: "custom" });
	const pageType = buildCustomType({ format: "page" });
	await writeLocalCustomType(project, customType);
	await writeLocalCustomType(project, pageType);

	const { stdout, exitCode } = await prismic("type", ["list"]);
	expect(exitCode).toBe(0);
	expect(stdout).toMatch(new RegExp(`${customType.label}\\s+${customType.id}\\s+custom`));
	expect(stdout).toMatch(new RegExp(`${pageType.label}\\s+${pageType.id}\\s+page`));
});

it("lists types as JSON", async ({ expect, prismic, project }) => {
	const customType = buildCustomType({ format: "custom" });
	await writeLocalCustomType(project, customType);

	const { stdout, exitCode } = await prismic("type", ["list", "--json"]);
	expect(exitCode).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(
		expect.arrayContaining([expect.objectContaining({ id: customType.id, format: "custom" })]),
	);
});
