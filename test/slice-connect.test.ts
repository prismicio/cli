import { buildCustomType, buildSlice, it } from "./it";
import { getCustomTypes, insertCustomType, insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["connect", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice connect <name> [options]");
});

it("connects a slice to a type", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	const customType = buildCustomType({
		format: "page",
		json: {
			Main: {
				slices: {
					type: "Slices",
					fieldset: "Slice Zone",
					config: { choices: {} },
				},
			},
		},
	});

	await insertSlice(slice, { repo, token, host });
	await insertCustomType(customType, { repo, token, host });

	const { stdout, exitCode } = await prismic("slice", [
		"connect",
		slice.name,
		"--to",
		customType.label!,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Connected slice "${slice.name}" to "${customType.label}"`);

	const customTypes = await getCustomTypes({ repo, token, host });
	const updated = customTypes.find((ct) => ct.id === customType.id);
	const choices = (updated?.json.Main as any).slices.config.choices;
	expect(choices[slice.id]).toEqual({ type: "SharedSlice" });
});
