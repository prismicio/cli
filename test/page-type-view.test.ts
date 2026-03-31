import { buildCustomType, it } from "./it";
import { insertCustomType } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("page-type", ["view", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic page-type view <name> [options]");
});

it("views a page type", async ({ expect, prismic, repo, token, host }) => {
	const pageType = buildCustomType({ format: "page" });
	await insertCustomType(pageType, { repo, token, host });

	const { stdout, exitCode } = await prismic("page-type", ["view", pageType.label!]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`ID: ${pageType.id}`);
	expect(stdout).toContain(`Name: ${pageType.label}`);
	expect(stdout).toContain("Repeatable: true");
	expect(stdout).toContain("Tabs: Main");
});

it("views a page type as JSON", async ({ expect, prismic, repo, token, host }) => {
	const pageType = buildCustomType({ format: "page" });
	await insertCustomType(pageType, { repo, token, host });

	const { stdout, exitCode } = await prismic("page-type", ["view", pageType.label!, "--json"]);
	expect(exitCode).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toMatchObject({ id: pageType.id, label: pageType.label, format: "page" });
});
