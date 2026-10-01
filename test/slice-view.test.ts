import { buildCustomType, buildSlice, it, writeLocalCustomType, writeLocalSlice } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("slice", ["view", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic slice view <id> [options]");
});

it("views a slice", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, stderr, exitCode } = await prismic("slice", ["view", slice.id]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`ID: ${slice.id}`);
	expect(stdout).toContain(`Name: ${slice.name}`);
	expect(stdout).toContain("default:");
});

it("shows fields per variation", async ({ expect, prismic, project }) => {
	const slice = buildSlice({
		variations: [
			{
				id: "default",
				name: "Default",
				docURL: "",
				version: "initial",
				description: "Default",
				imageUrl: "",
				primary: {
					title: { type: "StructuredText", config: { label: "Title", placeholder: "Enter title" } },
					is_active: { type: "Boolean", config: { label: "Is Active" } },
				},
			},
			{
				id: "withImage",
				name: "With Image",
				docURL: "",
				version: "initial",
				description: "With Image",
				imageUrl: "",
				primary: {
					image: { type: "Image", config: { label: "Image" } },
				},
			},
		],
	});
	await writeLocalSlice(project, slice);

	const { stdout, stderr, exitCode } = await prismic("slice", ["view", slice.id]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("default:");
	expect(stdout).toMatch(/title\s+StructuredText\s+Title\s+"Enter title"/);
	expect(stdout).toMatch(/is_active\s+Boolean\s+Is Active/);
	expect(stdout).toContain("withImage:");
	expect(stdout).toMatch(/image\s+Image\s+Image/);
});

it("views a slice as JSON", async ({ expect, prismic, project }) => {
	const slice = buildSlice();
	await writeLocalSlice(project, slice);

	const { stdout, stderr, exitCode } = await prismic("slice", ["view", slice.id, "--json"]);
	expect(exitCode, stderr).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toMatchObject({ id: slice.id, name: slice.name });
});

it("points at the upgrade for a legacy slice", async ({ expect, prismic, project }) => {
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

	const { stderr, exitCode } = await prismic("slice", ["view", "hero"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain(
		`"hero" is a legacy slice in "${customType.id}". Upgrade it first: \`prismic slice upgrade-legacy hero --from ${customType.id}\`.`,
	);
});
