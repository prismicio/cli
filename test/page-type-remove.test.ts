import { buildCustomType, it } from "./it";
import { getCustomTypes, insertCustomType } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("page-type", ["remove", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic page-type remove <name> [options]");
});

it("removes a page type", async ({ expect, prismic, repo, token, host }) => {
	const pageType = buildCustomType({ format: "page" });
	await insertCustomType(pageType, { repo, token, host });

	const { stdout, exitCode } = await prismic("page-type", ["remove", pageType.label!]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Page type removed: "${pageType.label}" (id: ${pageType.id})`);

	const customTypes = await getCustomTypes({ repo, token, host });
	const removed = customTypes.find((ct) => ct.id === pageType.id);
	expect(removed).toBeUndefined();
});
