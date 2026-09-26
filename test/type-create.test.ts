import { mkdir, writeFile } from "node:fs/promises";
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

it("keeps an existing page file", async ({ expect, prismic, project }) => {
	const { label } = buildCustomType({ format: "page" });
	const id = snakeCase(label!);
	const path = `app/${id.replaceAll("_", "-")}/[uid]/page.jsx`;
	await mkdir(new URL(".", new URL(path, project)), { recursive: true });
	await writeFile(new URL(path, project), "// existing page");

	const { stdout, stderr, exitCode } = await prismic("type", [
		"create",
		label!,
		"--format",
		"page",
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(
		`Skipped ${path.replaceAll("/", sep)} (already exists). Run \`prismic gen page ${id}\` to get the code.`,
	);

	await expect(project).toHaveFile(path, { contains: "// existing page" });
});

it("rejects invalid --format", async ({ expect, prismic }) => {
	const { label } = buildCustomType();

	const { stderr, exitCode } = await prismic("type", ["create", label!, "--format", "invalid"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Invalid format: "invalid"');
});

it("warns when a SvelteKit page already serves the page's URL", async ({
	expect,
	prismic,
	project,
}) => {
	await writeFile(
		new URL("package.json", project),
		JSON.stringify({ dependencies: { "@sveltejs/kit": "latest", svelte: "latest" } }),
	);
	await mkdir(new URL("src/routes/", project), { recursive: true });
	await writeFile(new URL("src/routes/+page.svelte", project), "<h1>Welcome to SvelteKit</h1>");

	const { stdout, stderr, exitCode } = await prismic("type", [
		"create",
		"Homepage",
		"--format",
		"page",
		"--single",
	]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(
		`${["src", "routes", "+page.svelte"].join(sep)} also serves /. Delete it to use the Prismic page.`,
	);
	await expect(project).toHaveFile("src/routes/[[preview=preview]]/+page.svelte");
});
