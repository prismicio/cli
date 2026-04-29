import { snakeCase } from "change-case";

import { buildSlice, it, readLocalSlice } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("slice", ["create", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic slice create <name> [options]");
});

it("creates a slice", async ({ expect, prismic, project }) => {
	const { name } = buildSlice();

	const { stdout, exitCode } = await prismic("slice", ["create", name]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Created slice "${name}"`);

	const id = snakeCase(name);
	const created = await readLocalSlice(project, id);
	expect(created).toBeDefined();
	expect(created?.name).toBe(name);
});

it("creates a slice with a custom id", async ({ expect, prismic, project }) => {
	const { name } = buildSlice();
	const id = `slice_${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("slice", ["create", name, "--id", id]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Created slice "${name}" (id: "${id}")`);

	const created = await readLocalSlice(project, id);
	expect(created).toBeDefined();
});
