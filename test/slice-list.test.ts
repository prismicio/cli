import { buildSlice, it } from "./it";
import { insertSlice } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["list", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice list [options]");
});

it("lists slices", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("slice", ["list"]);
	expect(exitCode).toBe(0);
	expect(stdout).toMatch(new RegExp(`${slice.name}\\s+${slice.id}`));
});

it("lists slices as JSON", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("slice", ["list", "--json"]);
	expect(exitCode).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(expect.arrayContaining([expect.objectContaining({ id: slice.id })]));
});
