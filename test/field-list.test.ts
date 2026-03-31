import { buildSlice, it } from "./it";
import { insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("field", ["list", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic field list [options]");
});

it("lists fields in a slice", async ({ expect, prismic, repo, token, host }) => {
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
					title: { type: "StructuredText", config: { label: "Title" } },
					is_active: { type: "Boolean", config: { label: "Is Active" } },
				},
			},
		],
	});
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"list",
		"--from-slice",
		slice.name,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("title");
	expect(stdout).toContain("StructuredText");
	expect(stdout).toContain("is_active");
	expect(stdout).toContain("Boolean");
});

it("lists fields as JSON with --json", async ({ expect, prismic, repo, token, host }) => {
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
					title: { type: "StructuredText", config: { label: "Title" } },
				},
			},
		],
	});
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"list",
		"--from-slice",
		slice.name,
		"--json",
	]);
	expect(exitCode).toBe(0);

	const fields = JSON.parse(stdout);
	expect(fields).toContainEqual({
		id: "title",
		type: "StructuredText",
		label: "Title",
	});
});

it("prints message when no fields exist", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("field", [
		"list",
		"--from-slice",
		slice.name,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("No fields found.");
});
