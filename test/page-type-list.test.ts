import { buildCustomType, it } from "./it";
import { insertCustomType } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("page-type", ["list", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic page-type list [options]");
});

it("lists page types", async ({ expect, prismic, repo, token, host }) => {
	const pageType = buildCustomType({ format: "page" });
	await insertCustomType(pageType, { repo, token, host });

	const { stdout, exitCode } = await prismic("page-type", ["list"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`${pageType.label} (id: ${pageType.id})`);
});

it("lists page types as JSON", async ({ expect, prismic, repo, token, host }) => {
	const pageType = buildCustomType({ format: "page" });
	await insertCustomType(pageType, { repo, token, host });

	const { stdout, exitCode } = await prismic("page-type", ["list", "--json"]);
	expect(exitCode).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(
		expect.arrayContaining([expect.objectContaining({ id: pageType.id, format: "page" })]),
	);
});
