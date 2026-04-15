import { buildSlice, it } from "./it";
import { getSlices } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["create", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice create <name> [options]");
});

it("creates a slice", async ({ expect, prismic, repo, token, host }) => {
	const { name } = buildSlice();

	const { stdout, exitCode } = await prismic("slice", ["create", name]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Created slice "${name}"`);

	const slices = await getSlices({ repo, token, host });
	const created = slices.find((s) => s.name === name);
	expect(created).toBeDefined();
});

it("creates a slice with a custom id", async ({ expect, prismic, repo, token, host }) => {
	const { name } = buildSlice();
	const id = `slice_${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("slice", ["create", name, "--id", id]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Created slice "${name}" (id: "${id}")`);

	const slices = await getSlices({ repo, token, host });
	const created = slices.find((s) => s.id === id);
	expect(created).toBeDefined();
});
