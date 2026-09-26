import { writeFile } from "node:fs/promises";
import { sep } from "node:path";

import { snakeCase } from "change-case";

import { buildCustomType, it, readLocalCustomType } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("type", ["create", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic type create <name> [options]");
});

it("creates a custom type", async ({ expect, prismic, project }) => {
	const { label } = buildCustomType({ format: "custom" });

	const { stdout, stderr, exitCode } = await prismic("type", ["create", label!]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Created type "${label}"`);

	const id = snakeCase(label!);
	const created = await readLocalCustomType(project, id);
	expect(created).toMatchObject({ label, format: "custom", repeatable: true });
	expect(created.json.Main.uid).toEqual({ type: "UID", config: { label: "UID" } });
});

it("creates a page type with --format page", async ({ expect, prismic, project }) => {
	const { label } = buildCustomType({ format: "page" });

	const { stdout, stderr, exitCode } = await prismic("type", [
		"create",
		label!,
		"--format",
		"page",
	]);
	expect(exitCode, stderr).toBe(0);
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

	const { stderr, exitCode } = await prismic("type", ["create", label!, "--single"]);
	expect(exitCode, stderr).toBe(0);

	const id = snakeCase(label!);
	const created = await readLocalCustomType(project, id);
	expect(created).toMatchObject({ format: "custom", repeatable: false });
	expect(created.json.Main).not.toHaveProperty("uid");
});

it("creates a custom type with a custom id", async ({ expect, prismic, project }) => {
	const { label } = buildCustomType({ format: "custom" });
	const id = `custom_type_${crypto.randomUUID().split("-")[0]}`;

	const { stdout, stderr, exitCode } = await prismic("type", ["create", label!, "--id", id]);
	expect(exitCode, stderr).toBe(0);
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

it("refuses to replace an existing type", async ({ expect, prismic, project }) => {
	const { label } = buildCustomType({ format: "custom" });
	const id = snakeCase(label!);

	const first = await prismic("type", ["create", label!]);
	expect(first.exitCode, first.stderr).toBe(0);

	const edited = { ...(await readLocalCustomType(project, id)), label: "Edited" };
	await writeFile(new URL(`customtypes/${id}/index.json`, project), JSON.stringify(edited));

	const second = await prismic("type", ["create", label!]);
	expect(second.exitCode).toBe(1);
	expect(second.stderr).toContain(
		`A type already exists at ${["customtypes", id, ""].join(sep)} (id: ${id})`,
	);
	expect(await readLocalCustomType(project, id)).toEqual(edited);
});
