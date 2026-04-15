import { buildCustomType, it } from "./it";
import { insertCustomType } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("type", ["list", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic type list [options]");
});

it("lists all types", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({ format: "custom" });
	const pageType = buildCustomType({ format: "page" });
	await insertCustomType(customType, { repo, token, host });
	await insertCustomType(pageType, { repo, token, host });

	const { stdout, exitCode } = await prismic("type", ["list"]);
	expect(exitCode).toBe(0);
	expect(stdout).toMatch(new RegExp(`${customType.label}\\s+${customType.id}\\s+custom`));
	expect(stdout).toMatch(new RegExp(`${pageType.label}\\s+${pageType.id}\\s+page`));
});

it("lists types as JSON", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({ format: "custom" });
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("type", ["list", "--json"]);
	expect(exitCode).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(
		expect.arrayContaining([expect.objectContaining({ id: customType.id, format: "custom" })]),
	);
});
