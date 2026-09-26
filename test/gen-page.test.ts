import { mkdir, writeFile } from "node:fs/promises";
import { sep } from "node:path";

import { buildCustomType, it, writeLocalCustomType } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("gen", ["page", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic gen page <type-id> [options]");
});

it("writes a missing page", async ({ expect, project, prismic }) => {
	const customType = buildCustomType({ format: "page", repeatable: false });
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("gen", ["page", customType.id]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Generated the page for "${customType.id}"`);

	await expect(project).toHaveFile(`app/${customType.id.toLowerCase()}/page.jsx`, {
		contains: `getSingle("${customType.id}"`,
	});
});

it("prints the code for an existing page", async ({ expect, project, prismic }) => {
	const customType = buildCustomType({ format: "page", repeatable: false });
	await writeLocalCustomType(project, customType);
	// create-next-app names JavaScript pages page.js, while the CLI writes page.jsx.
	const path = `app/${customType.id.toLowerCase()}/page.js`;
	await mkdir(new URL(".", new URL(path, project)), { recursive: true });
	await writeFile(new URL(path, project), "// existing page");

	const { stdout, stderr, exitCode } = await prismic("gen", ["page", customType.id]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`getSingle("${customType.id}"`);
	await expect(project).not.toHaveFile(`app/${customType.id.toLowerCase()}/page.jsx`);
	expect(stdout).toContain(
		`Merge this into ${path.replaceAll("/", sep)}, or rerun with --force to replace it.`,
	);

	await expect(project).toHaveFile(path, { contains: "// existing page" });
});

it("replaces an existing page with --force", async ({ expect, project, prismic }) => {
	const customType = buildCustomType({ format: "page", repeatable: false });
	await writeLocalCustomType(project, customType);
	const path = `app/${customType.id.toLowerCase()}/page.jsx`;
	await mkdir(new URL(".", new URL(path, project)), { recursive: true });
	await writeFile(new URL(path, project), "// existing page");

	const { stderr, exitCode } = await prismic("gen", ["page", customType.id, "--force"]);
	expect(exitCode, stderr).toBe(0);

	await expect(project).toHaveFile(path, { contains: `getSingle("${customType.id}"` });
});

it("errors for a non-page type", async ({ expect, project, prismic }) => {
	const customType = buildCustomType({ format: "custom" });
	await writeLocalCustomType(project, customType);

	const { stderr, exitCode } = await prismic("gen", ["page", customType.id]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain(`"${customType.id}" is not a page type.`);
});

it("errors for an unknown type", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("gen", ["page", "unknown"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("No custom type found with ID: unknown");
});

it("uses the route from prismic.config.json", async ({ expect, project, prismic, repo }) => {
	const customType = buildCustomType({ format: "page", repeatable: true });
	await writeLocalCustomType(project, customType);
	await writeFile(
		new URL("prismic.config.json", project),
		JSON.stringify({
			repositoryName: repo,
			routes: [{ type: customType.id, path: "/articles/:uid" }],
		}),
	);

	const { stderr, exitCode } = await prismic("gen", ["page", customType.id]);
	expect(exitCode, stderr).toBe(0);

	await expect(project).toHaveFile("app/articles/[uid]/page.jsx", {
		contains: `getByUID("${customType.id}"`,
	});
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
	const customType = buildCustomType({ format: "page", repeatable: false });
	await writeLocalCustomType(project, customType);
	const directory = customType.id.replaceAll("_", "-").toLowerCase();
	await mkdir(new URL(`src/routes/${directory}/`, project), { recursive: true });
	await writeFile(new URL(`src/routes/${directory}/+page.svelte`, project), "<h1>My page</h1>");

	const { stdout, stderr, exitCode } = await prismic("gen", ["page", customType.id]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(
		`${["src", "routes", directory, "+page.svelte"].join(sep)} also serves /${directory}. Delete it to use the Prismic page.`,
	);
});
