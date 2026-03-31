import { buildCustomType, it } from "./it";
import { getCustomTypes } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("custom-type", ["create", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic custom-type create <name> [options]");
});

it("creates a custom type", async ({ expect, prismic, repo, token, host }) => {
	const { label } = buildCustomType({ format: "custom" });

	const { stdout, exitCode } = await prismic("custom-type", ["create", label!]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Created custom type "${label}"`);

	const customTypes = await getCustomTypes({ repo, token, host });
	const created = customTypes.find((ct) => ct.label === label);
	expect(created).toMatchObject({ format: "custom", repeatable: true });
});

it("creates a single custom type", async ({ expect, prismic, repo, token, host }) => {
	const { label } = buildCustomType({ format: "custom" });

	const { exitCode } = await prismic("custom-type", ["create", label!, "--single"]);
	expect(exitCode).toBe(0);

	const customTypes = await getCustomTypes({ repo, token, host });
	const created = customTypes.find((ct) => ct.label === label);
	expect(created).toMatchObject({ format: "custom", repeatable: false });
});

it("creates a custom type with a custom id", async ({ expect, prismic, repo, token, host }) => {
	const { label } = buildCustomType({ format: "custom" });
	const id = `CustomType${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("custom-type", ["create", label!, "--id", id]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Created custom type "${label}" (id: "${id}")`);

	const customTypes = await getCustomTypes({ repo, token, host });
	const created = customTypes.find((ct) => ct.id === id);
	expect(created).toBeDefined();
});
