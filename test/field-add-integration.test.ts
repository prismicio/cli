import { buildCustomType, buildSlice, it } from "./it";
import { getCustomTypes, getSlices, insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["add", "integration", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field add integration <id> [options]");
});

it("adds an integration field to a slice", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"integration",
		"my_integration",
		"--to-slice",
		slice.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_integration");

	const slices = await getSlices({ repo, token, host });
	const updated = slices.find((s) => s.id === slice.id);
	const field = updated!.variations[0].primary!.my_integration;
	expect(field).toMatchObject({ type: "IntegrationFields" });
});

it("adds an integration field to a custom type", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType();
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"add",
		"integration",
		"my_integration",
		"--to-type",
		customType.id,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Field added: my_integration");

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	const field = updated!.json.Main.my_integration;
	expect(field).toMatchObject({ type: "IntegrationFields" });
});
