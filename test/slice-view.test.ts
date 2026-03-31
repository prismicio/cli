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
	expect(stdout).toContain("Variations: default");
});

it("views a slice as JSON", async ({ expect, prismic, repo, token, host }) => {
	const slice = buildSlice();
	await insertSlice(slice, { repo, token, host });

	const { stdout, exitCode } = await prismic("slice", ["view", slice.name, "--json"]);
	expect(exitCode).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toMatchObject({ id: slice.id, name: slice.name });
});
