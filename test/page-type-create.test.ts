import { buildCustomType, it } from "./it";
import { getCustomTypes } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("page-type", ["create", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic page-type create <name> [options]");
});

it("creates a page type", async ({ expect, prismic, repo, token, host }) => {
	const { label } = buildCustomType({ format: "page" });

	const { stdout, exitCode } = await prismic("page-type", ["create", label!]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Created page type "${label}"`);

	const customTypes = await getCustomTypes({ repo, token, host });
	const created = customTypes.find((ct) => ct.label === label);
	expect(created).toMatchObject({ format: "page", repeatable: true });
});

it("creates a single page type", async ({ expect, prismic, repo, token, host }) => {
	const { label } = buildCustomType({ format: "page" });

	const { exitCode } = await prismic("page-type", ["create", label!, "--single"]);
	expect(exitCode).toBe(0);

	const customTypes = await getCustomTypes({ repo, token, host });
	const created = customTypes.find((ct) => ct.label === label);
	expect(created).toMatchObject({ format: "page", repeatable: false });
});

it("creates a page type with a custom id", async ({ expect, prismic, repo, token, host }) => {
	const { label } = buildCustomType({ format: "page" });
	const id = `PageType${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("page-type", ["create", label!, "--id", id]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Created page type "${label}" (id: "${id}")`);

	const customTypes = await getCustomTypes({ repo, token, host });
	const created = customTypes.find((ct) => ct.id === id);
	expect(created).toBeDefined();
});
