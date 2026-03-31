import { buildCustomType, it } from "./it";
import { insertCustomType } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("custom-type", ["list", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic custom-type list [options]");
});

it("lists custom types", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({ format: "custom" });
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("custom-type", ["list"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`${customType.label} (id: ${customType.id})`);
});

it("lists custom types as JSON", async ({ expect, prismic, repo, token, host }) => {
	const customType = buildCustomType({ format: "custom" });
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("custom-type", ["list", "--json"]);
	expect(exitCode).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(
		expect.arrayContaining([expect.objectContaining({ id: customType.id, format: "custom" })]),
	);
});
