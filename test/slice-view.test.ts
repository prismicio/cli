import { buildSlice, it } from "./it";
import { insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["view", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice view <name> [options]");
});

it("views a slice", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("slice", ["view", slice.name]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`ID: ${slice.id}`);
	expect(stdout).toContain(`Name: ${slice.name}`);
	expect(stdout).toContain("default:");
});

it("shows fields per variation", async ({ expect, prismic, repo, token, host }) => {
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
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("slice", ["view", slice.name]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("default:");
	expect(stdout).toMatch(/title\s+StructuredText\s+Title\s+"Enter title"/);
	expect(stdout).toMatch(/is_active\s+Boolean\s+Is Active/);
	expect(stdout).toContain("withImage:");
	expect(stdout).toMatch(/image\s+Image\s+Image/);
});

it("views a slice as JSON", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("slice", ["view", slice.name, "--json"]);
	expect(exitCode).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toMatchObject({ id: slice.id, name: slice.name });
});
