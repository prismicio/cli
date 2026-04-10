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
	expect(stdout).toContain("title  StructuredText  Title");
	expect(stdout).toContain('"Enter title"');
	expect(stdout).toContain("is_active  Boolean  Is Active");
	expect(stdout).toContain("withImage:");
	expect(stdout).toContain("image  Image  Image");
});

it("views a slice as JSON", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("slice", ["view", slice.name, "--json"]);
	expect(exitCode).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toMatchObject({ id: slice.id, name: slice.name });
});
