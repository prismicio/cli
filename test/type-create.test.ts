import { snakeCase } from "change-case";

import { buildCustomType, it, readLocalCustomType } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("type", ["create", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic type create <name> [options]");
});

it("creates a custom type", async ({ expect, prismic, project }) => {
	const { label } = buildCustomType({ format: "custom" });

	const { stdout, exitCode } = await prismic("type", ["create", label!]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Created type "${label}"`);

	const id = snakeCase(label!);
	const created = await readLocalCustomType(project, id);
	expect(created).toMatchObject({ label, format: "custom", repeatable: true });
	expect(created.json.Main.uid).toEqual({ type: "UID", config: { label: "UID" } });
});

it("creates a page type with --format page", async ({ expect, prismic, project }) => {
	const { label } = buildCustomType({ format: "page" });

	const { stdout, exitCode } = await prismic("type", ["create", label!, "--format", "page"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Created type "${label}"`);

	const id = snakeCase(label!);
	const created = await readLocalCustomType(project, id);
	expect(created).toMatchObject({ format: "page", repeatable: true });
	expect(created.json).toHaveProperty("SEO & Metadata");
	expect(created.json.Main).toHaveProperty("slices");
	expect(created.json.Main.uid).toEqual({ type: "UID", config: { label: "UID" } });
});

it("creates a single custom type", async ({ expect, prismic, project }) => {
	const { label } = buildCustomType({ format: "custom" });

	const { exitCode } = await prismic("type", ["create", label!, "--single"]);
	expect(exitCode).toBe(0);

	const id = snakeCase(label!);
	const created = await readLocalCustomType(project, id);
	expect(created).toMatchObject({ format: "custom", repeatable: false });
	expect(created.json.Main).not.toHaveProperty("uid");
});

it("creates a custom type with a custom id", async ({ expect, prismic, project }) => {
	const { label } = buildCustomType({ format: "custom" });
	const id = `custom_type_${crypto.randomUUID().split("-")[0]}`;

	const { stdout, exitCode } = await prismic("type", ["create", label!, "--id", id]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Created type "${label}" (id: "${id}"`);

	const created = await readLocalCustomType(project, id);
	expect(created.id).toBe(id);
});

it("rejects invalid --format", async ({ expect, prismic }) => {
	const { label } = buildCustomType();

	const { stderr, exitCode } = await prismic("type", ["create", label!, "--format", "invalid"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Invalid format: "invalid"');
});
