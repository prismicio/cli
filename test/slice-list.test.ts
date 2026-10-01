import { buildCustomType, buildSlice, it, writeLocalCustomType, writeLocalSlice } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("slice", ["list", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic slice list [options]");
});

it("lists slices", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, stderr, exitCode } = await prismic("slice", ["list"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toMatch(new RegExp(`${slice.name}\\s+${slice.id}`));
});

it("lists slices as JSON", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, stderr, exitCode } = await prismic("slice", ["list", "--json"]);
	expect(exitCode, stderr).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(expect.arrayContaining([expect.objectContaining({ id: slice.id })]));
});

it("marks legacy slices", async ({ expect, prismic, project }) => {
	const customType = buildCustomType({
		json: {
			Main: {
				body: {
					type: "Slices",
					config: {
						choices: {
							cta: { type: "SharedSlice" },
							hero: { type: "Slice", fieldset: "Hero", "non-repeat": {}, repeat: {} },
						},
					},
				},
			},
		},
	});
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("slice", ["list"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toMatch(new RegExp(`Hero \\*\\s+hero\\s+${customType.id}`));
	expect(stdout).toContain(
		"* Legacy slice. Run `prismic slice upgrade-legacy --help` to upgrade it.",
	);
});

it("lists only legacy slices as JSON", async ({ expect, prismic, project }) => {
	await writeLocalSlice(project, buildSlice());
	const customType = buildCustomType({
		json: {
			Main: {
				body: {
					type: "Slices",
					config: {
						choices: {
							cta: { type: "SharedSlice" },
							hero: { type: "Slice", fieldset: "Hero", "non-repeat": {}, repeat: {} },
						},
					},
				},
			},
		},
	});
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("slice", ["list", "--legacy", "--json"]);
	expect(exitCode, stderr).toBe(0);
	expect(JSON.parse(stdout)).toEqual([{ id: "hero", definedIn: customType.id, sliceZone: "body" }]);
});
